// Integracao do modulo estoque_insumos contra o Postgres local (role whaviso_api).
// Cobre CRUD do insumo, movimentos (entrada/saida/ajuste), saldo nunca negativo, baixo-estoque.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarEstoqueRoutes } from './routes'
import { consumirInsumo } from './consumo'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[estoque_insumos] banco inacessivel: integracao PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('estoque-teste', 'info'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'estoque-insumos', plugin: criarEstoqueRoutes() }],
  })
  await app.ready()
  return app
}

d('modulo estoque_insumos (integracao)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let dono: string, lojaA: string

  const chamar = (
    user: string, loja: string | null, metodo: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown,
  ) =>
    app.inject({
      method: metodo,
      url: `/v1/estoque-insumos${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    dono = await criarUsuario(cen)
    const conta = await criarConta(cen, dono)
    lojaA = await criarLoja(conta)
    lojas.push(lojaA)
    await criarMembro(conta, dono, 'dono', null)
    app = await montar()
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojas) {
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  let insumoId = ''
  it('cria insumo: 201, saldo inicial gera movimento entrada, abaixo_minimo correto', async () => {
    const r = await chamar(dono, lojaA, 'POST', '', {
      nome: 'Arroz', unidade: 'kg', quantidade_minima: 5, quantidade_inicial: 10, custo_unitario_centavos: 650,
    })
    expect(r.statusCode).toBe(201)
    const i = r.json()
    insumoId = i.id
    expect(i).toMatchObject({
      nome: 'Arroz', unidade: 'kg', quantidade_atual: 10, quantidade_minima: 5,
      custo_unitario_centavos: 650, ativo: true, abaixo_minimo: false,
    })
    const movs = (await chamar(dono, lojaA, 'GET', `/${insumoId}/movimentos`)).json().itens
    expect(movs).toHaveLength(1)
    expect(movs[0]).toMatchObject({ tipo: 'entrada', quantidade: 10, quantidade_resultante: 10 })
  })

  it('PATCH edita cadastro; quantidade_atual nao e campo de cadastro (400)', async () => {
    const r = await chamar(dono, lojaA, 'PATCH', `/${insumoId}`, { quantidade_minima: 12 })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ quantidade_minima: 12, abaixo_minimo: true })
    const ruim = await chamar(dono, lojaA, 'PATCH', `/${insumoId}`, { quantidade_atual: 99 })
    expect(ruim.statusCode).toBe(400)
    const vazio = await chamar(dono, lojaA, 'PATCH', `/${insumoId}`, {})
    expect(vazio.statusCode).toBe(400)
  })

  it('movimento entrada soma e saida subtrai, registrando quantidade_resultante', async () => {
    const ent = await chamar(dono, lojaA, 'POST', '/movimentos', { insumo_id: insumoId, tipo: 'entrada', quantidade: 5 })
    expect(ent.statusCode).toBe(201)
    expect(ent.json()).toMatchObject({
      insumo: { quantidade_atual: 15 }, movimento: { tipo: 'entrada', quantidade: 5, quantidade_resultante: 15 },
    })
    const sai = await chamar(dono, lojaA, 'POST', '/movimentos', { insumo_id: insumoId, tipo: 'saida', quantidade: 3, motivo: 'perda' })
    expect(sai.json().movimento).toMatchObject({ tipo: 'saida', quantidade: 3, quantidade_resultante: 12, motivo: 'perda' })
  })

  it('saida maior que o saldo: 422 estoque_insuficiente, saldo intacto', async () => {
    const r = await chamar(dono, lojaA, 'POST', '/movimentos', { insumo_id: insumoId, tipo: 'saida', quantidade: 999 })
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('estoque_insuficiente')
    expect((await chamar(dono, lojaA, 'GET', `/${insumoId}`)).json().quantidade_atual).toBe(12)
  })

  it('ajuste define o saldo absoluto (recontagem)', async () => {
    const r = await chamar(dono, lojaA, 'POST', '/movimentos', { insumo_id: insumoId, tipo: 'ajuste', quantidade: 2 })
    expect(r.json()).toMatchObject({
      insumo: { quantidade_atual: 2, abaixo_minimo: true }, movimento: { tipo: 'ajuste', quantidade_resultante: 2 },
    })
  })

  it('baixo-estoque lista so quem esta no/abaixo do minimo', async () => {
    await chamar(dono, lojaA, 'POST', '', { nome: 'Sal', unidade: 'kg', quantidade_minima: 1, quantidade_inicial: 50 })
    const itens = (await chamar(dono, lojaA, 'GET', '/baixo-estoque')).json().itens as { nome: string }[]
    expect(itens.map((i) => i.nome)).toEqual(['Arroz'])
  })

  it('lista ordena abaixo_minimo primeiro e esconde inativos salvo ?incluir_inativos', async () => {
    const criado = (await chamar(dono, lojaA, 'POST', '', { nome: 'Oleo', unidade: 'l', quantidade_inicial: 3 })).json()
    await chamar(dono, lojaA, 'PATCH', `/${criado.id}`, { ativo: false })
    const ativos = (await chamar(dono, lojaA, 'GET', '')).json().itens as { nome: string; abaixo_minimo: boolean }[]
    expect(ativos.map((i) => i.nome)).not.toContain('Oleo')
    expect(ativos[0]?.abaixo_minimo).toBe(true) // Arroz primeiro
    const todos = (await chamar(dono, lojaA, 'GET', '?incluir_inativos=true')).json().itens as { nome: string }[]
    expect(todos.map((i) => i.nome)).toContain('Oleo')
  })

  it('unidade invalida: 400; id inexistente: 404', async () => {
    expect((await chamar(dono, lojaA, 'POST', '', { nome: 'X', unidade: 'toneladas' })).statusCode).toBe(400)
    expect((await chamar(dono, lojaA, 'GET', `/${randomUUID()}`)).statusCode).toBe(404)
    expect((await chamar(dono, lojaA, 'POST', '/movimentos', { insumo_id: randomUUID(), tipo: 'entrada', quantidade: 1 })).statusCode).toBe(404)
  })

  it('consumirInsumo (ficha tecnica): decrementa, registra consumo e nunca fica negativo', async () => {
    const i = (await chamar(dono, lojaA, 'POST', '', { nome: 'Carne', unidade: 'kg', quantidade_inicial: 4 })).json()
    const ok = await consumirInsumo(poolApi, { insumo_id: i.id, loja_id: lojaA, quantidade: 1.5, pedido_id: null, user_id: dono })
    expect(ok).toMatchObject({ aplicado: true, quantidade_resultante: 2.5 })
    const falta = await consumirInsumo(poolApi, { insumo_id: i.id, loja_id: lojaA, quantidade: 999 })
    expect(falta).toEqual({ aplicado: false, motivo: 'estoque_insuficiente' })
    const semInsumo = await consumirInsumo(poolApi, { insumo_id: randomUUID(), loja_id: lojaA, quantidade: 1 })
    expect(semInsumo).toEqual({ aplicado: false, motivo: 'insumo_nao_encontrado' })
    expect((await chamar(dono, lojaA, 'GET', `/${i.id}`)).json().quantidade_atual).toBe(2.5)
    const movs = (await chamar(dono, lojaA, 'GET', `/${i.id}/movimentos`)).json().itens as { tipo: string }[]
    expect(movs.some((m) => m.tipo === 'consumo')).toBe(true)
  })
})
