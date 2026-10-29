// Integracao do modulo promocoes contra o Postgres local (role whaviso_api).
// Cobre CRUD, validacao/aplicacao de cupom, ledger de usos (idempotencia e limites), papeis e isolamento multi-tenant.
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
import { promocoesRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[promocoes] banco inacessivel: integracao PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('promocoes-teste', 'silent'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'promocoes', plugin: promocoesRoutes }],
  })
  await app.ready()
  return app
}

d('modulo promocoes (integracao)', () => {
  const cen = novoCenario()
  let app: Awaited<ReturnType<typeof montar>>
  let dono: string, atend: string, donoB: string
  let lojaA: string, lojaB: string
  let itemA: string, itemB: string, itemLojaB: string
  let clienteA: string

  const chamar = (user: string, loja: string, metodo: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/promocoes${url}`,
      headers: { authorization: `Bearer ${user}`, 'x-loja-id': loja },
      payload: payload as object | undefined,
    })

  async function criarItem(loja: string): Promise<string> {
    const cat = randomUUID()
    const item = randomUUID()
    await poolSuper.query('insert into public.categorias (id, loja_id, nome) values ($1,$2,$3)', [cat, loja, 'Cat'])
    await poolSuper.query(
      'insert into public.itens (id, loja_id, categoria_id, nome, preco_centavos) values ($1,$2,$3,$4,$5)',
      [item, loja, cat, 'Item', 3000],
    )
    return item
  }
  async function criarPedido(loja: string, cliente: string | null = null): Promise<string> {
    const id = randomUUID()
    await poolSuper.query(
      `insert into public.pedidos (id, loja_id, cliente_id, codigo, subtotal_centavos, total_centavos)
       values ($1,$2,$3,$4,10000,10000)`,
      [id, loja, cliente, randomUUID().slice(0, 8)],
    )
    return id
  }

  beforeAll(async () => {
    app = await montar()
    dono = await criarUsuario(cen)
    atend = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, dono)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaA, atend, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    itemA = await criarItem(lojaA)
    itemB = await criarItem(lojaA)
    itemLojaB = await criarItem(lojaB)
    clienteA = randomUUID()
    await poolSuper.query(
      'insert into public.clientes (id, loja_id, telefone_hash) values ($1,$2,$3)',
      [clienteA, lojaA, 'a'.repeat(64)],
    )
  })
  afterAll(async () => {
    await app.close()
    await limpar(cen)
    await fecharPools()
  })

  const cupom = (extra: object = {}) => ({
    nome: 'Cupom teste', tipo: 'cupom_percentual', codigo: `t${randomUUID().slice(0, 6)}`, valor: 10, ...extra,
  })

  it('dono cria, lista e detalha; codigo normalizado em maiusculas', async () => {
    const r = await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'bemvindo10', min_pedido_centavos: 2000 }))
    expect(r.statusCode).toBe(201)
    const c = r.json()
    expect(c.codigo).toBe('BEMVINDO10')
    expect(c.usos_total).toBe(0)
    expect((await chamar(dono, lojaA, 'GET', `/${c.id}`)).json().nome).toBe('Cupom teste')
    const lista = (await chamar(dono, lojaA, 'GET', '/?ativo=true')).json()
    expect(lista.itens.some((p: { id: string }) => p.id === c.id)).toBe(true)
  })

  it('codigo duplicado na loja = 409; mesmo codigo em outra loja pode', async () => {
    const corpo = cupom({ codigo: 'DUPLO' })
    expect((await chamar(dono, lojaA, 'POST', '/', corpo)).statusCode).toBe(201)
    const dup = await chamar(dono, lojaA, 'POST', '/', corpo)
    expect(dup.statusCode).toBe(409)
    expect(dup.json().error.code).toBe('codigo_ja_existe')
    expect((await chamar(donoB, lojaB, 'POST', '/', corpo)).statusCode).toBe(201)
  })

  it('entrada invalida = 400 (percentual 150, cupom sem codigo, combo sem itens, campo extra)', async () => {
    for (const corpo of [
      cupom({ valor: 150 }),
      { nome: 'x', tipo: 'cupom_fixo', valor: 100 },
      { nome: 'x', tipo: 'combo', codigo: 'COMBO1', valor: 100 },
      cupom({ extra: 1 }),
      cupom({ inicio_em: '2026-10-28T00:00:00-03:00', fim_em: '2026-10-27T00:00:00-03:00' }),
    ]) {
      const r = await chamar(dono, lojaA, 'POST', '/', corpo)
      expect(r.statusCode).toBe(400)
      expect(r.json().error.code).toBe('entrada_invalida')
    }
  })

  it('atendente nao gerencia (403) mas valida/aplica no pedido', async () => {
    expect((await chamar(atend, lojaA, 'POST', '/', cupom())).statusCode).toBe(403)
    expect((await chamar(atend, lojaA, 'GET', '/')).statusCode).toBe(403)
    await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'ATEND5', valor: 5 }))
    const v = await chamar(atend, lojaA, 'POST', '/validar', { codigo: 'atend5', subtotal_centavos: 10000 })
    expect(v.statusCode).toBe(200)
    expect(v.json()).toMatchObject({ valido: true, desconto_centavos: 500, total_centavos: 9500 })
  })

  it('validar devolve motivo (200); aplicar devolve 422 com code do motivo', async () => {
    await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'MIN50', min_pedido_centavos: 5000 }))
    const v = (await chamar(dono, lojaA, 'POST', '/validar', { codigo: 'MIN50', subtotal_centavos: 1000 })).json()
    expect(v).toMatchObject({ valido: false, motivo: 'pedido_abaixo_minimo', desconto_centavos: 0, total_centavos: 1000 })
    const a = await chamar(dono, lojaA, 'POST', '/aplicar', { codigo: 'MIN50', subtotal_centavos: 1000 })
    expect(a.statusCode).toBe(422)
    expect(a.json().error.code).toBe('pedido_abaixo_minimo')
    const ine = await chamar(dono, lojaA, 'POST', '/aplicar', { codigo: 'NAOEXISTE', subtotal_centavos: 1000 })
    expect(ine.json().error.code).toBe('cupom_inexistente')
  })

  it('janela: expirado e nao iniciado; desativar (ativo=false) vira cupom_inativo', async () => {
    await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'VELHO', fim_em: '2020-01-01T00:00:00-03:00' }))
    await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'FUTURO', inicio_em: '2099-01-01T00:00:00-03:00' }))
    const cr = (await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'DESLIGA' }))).json()
    const motivo = async (codigo: string) =>
      (await chamar(dono, lojaA, 'POST', '/validar', { codigo, subtotal_centavos: 5000 })).json().motivo
    expect(await motivo('VELHO')).toBe('cupom_expirado')
    expect(await motivo('FUTURO')).toBe('cupom_nao_iniciado')
    expect(await motivo('DESLIGA')).toBeNull()
    const p = await chamar(dono, lojaA, 'PATCH', `/${cr.id}`, { ativo: false })
    expect(p.statusCode).toBe(200)
    expect(await motivo('DESLIGA')).toBe('cupom_inativo')
  })

  it('uso: idempotente por pedido e respeita limite total e por cliente', async () => {
    const cr = (await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'LIM1', limite_total: 1 }))).json()
    const p1 = await criarPedido(lojaA, clienteA)
    const p2 = await criarPedido(lojaA, clienteA)
    const u1 = await chamar(atend, lojaA, 'POST', '/usos', { promocao_id: cr.id, pedido_id: p1, cliente_id: clienteA, desconto_centavos: 1000 })
    expect(u1.statusCode).toBe(201)
    const rep = await chamar(atend, lojaA, 'POST', '/usos', { promocao_id: cr.id, pedido_id: p1, cliente_id: clienteA, desconto_centavos: 1000 })
    expect(rep.statusCode).toBe(200)
    expect(rep.json().criado).toBe(false)
    const u2 = await chamar(atend, lojaA, 'POST', '/usos', { promocao_id: cr.id, pedido_id: p2, desconto_centavos: 1000 })
    expect(u2.statusCode).toBe(422)
    expect(u2.json().error.code).toBe('cupom_esgotado')
    expect((await chamar(dono, lojaA, 'GET', `/${cr.id}`)).json().usos_total).toBe(1)
    const v = (await chamar(dono, lojaA, 'POST', '/validar', { codigo: 'LIM1', subtotal_centavos: 5000 })).json()
    expect(v.motivo).toBe('cupom_esgotado')

    const cr2 = (await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'POR1', limite_por_cliente: 1 }))).json()
    await chamar(atend, lojaA, 'POST', '/usos', { promocao_id: cr2.id, pedido_id: p1, cliente_id: clienteA, desconto_centavos: 500 })
    const v2 = (await chamar(dono, lojaA, 'POST', '/validar', { codigo: 'POR1', subtotal_centavos: 5000, cliente_id: clienteA })).json()
    expect(v2.motivo).toBe('cupom_cliente_esgotado')
    const v3 = (await chamar(dono, lojaA, 'POST', '/validar', { codigo: 'POR1', subtotal_centavos: 5000 })).json()
    expect(v3.valido).toBe(true)
  })

  it('uso: ignora desconto forjado no corpo e grava o valor recomputado pela regra', async () => {
    // Cupom de 10% sobre um pedido de subtotal 10000 => desconto real = 1000, independente do corpo.
    const cr = (await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'FORJADO', valor: 10 }))).json()
    const ped = await criarPedido(lojaA, clienteA)
    const u = await chamar(atend, lojaA, 'POST', '/usos', {
      promocao_id: cr.id, pedido_id: ped, cliente_id: clienteA, desconto_centavos: 999999,
    })
    expect(u.statusCode).toBe(201)
    expect(u.json().desconto_centavos).toBe(1000)
    // Confere direto no banco que o valor forjado nao foi persistido.
    const linha = await poolSuper.query(
      'select desconto_centavos from public.promocao_usos where promocao_id = $1 and pedido_id = $2',
      [cr.id, ped],
    )
    expect(linha.rows[0].desconto_centavos).toBe(1000)
  })

  it('combo: cria com itens da loja, rejeita item de outra loja, aplica sobre as linhas', async () => {
    const ruim = await chamar(dono, lojaA, 'POST', '/', {
      nome: 'Combo ruim', tipo: 'combo', valor: 1000, itens: [{ item_id: itemLojaB, quantidade: 1 }],
    })
    expect(ruim.statusCode).toBe(422)
    expect(ruim.json().error.code).toBe('item_invalido')
    const r = await chamar(dono, lojaA, 'POST', '/', {
      nome: 'Combo duplo', tipo: 'combo', codigo: 'COMBO2', valor: 5000,
      itens: [{ item_id: itemA, quantidade: 1 }, { item_id: itemB, quantidade: 1 }],
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().itens).toHaveLength(2)
    const linhas = [
      { item_id: itemA, quantidade: 1, preco_unitario_centavos: 3000 },
      { item_id: itemB, quantidade: 1, preco_unitario_centavos: 3000 },
    ]
    const v = (await chamar(atend, lojaA, 'POST', '/validar', { codigo: 'COMBO2', subtotal_centavos: 6000, linhas })).json()
    expect(v).toMatchObject({ valido: true, desconto_centavos: 1000, total_centavos: 5000 })
    const inc = (await chamar(atend, lojaA, 'POST', '/validar', { codigo: 'COMBO2', subtotal_centavos: 3000, linhas: [linhas[0]] })).json()
    expect(inc.motivo).toBe('combo_incompleto')
  })

  it('multi-tenant: outra loja nao ve nem aplica cupom da loja A', async () => {
    const cr = (await chamar(dono, lojaA, 'POST', '/', cupom({ codigo: 'SOLOJAA' }))).json()
    expect((await chamar(donoB, lojaB, 'GET', `/${cr.id}`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'PATCH', `/${cr.id}`, { ativo: false })).statusCode).toBe(404)
    const v = (await chamar(donoB, lojaB, 'POST', '/validar', { codigo: 'SOLOJAA', subtotal_centavos: 5000 })).json()
    expect(v.motivo).toBe('cupom_inexistente')
    const pedB = await criarPedido(lojaB)
    const uso = await chamar(donoB, lojaB, 'POST', '/usos', { promocao_id: cr.id, pedido_id: pedB, desconto_centavos: 100 })
    expect(uso.statusCode).toBe(404)
    // usuario da loja A tentando agir na loja B: sem membro => bloqueado
    expect((await chamar(dono, lojaB, 'GET', '/')).statusCode).toBeGreaterThanOrEqual(403)
    const listaB = (await chamar(donoB, lojaB, 'GET', '/')).json()
    expect(listaB.itens.some((p: { id: string }) => p.id === cr.id)).toBe(false)
  })

  it('role da api nao tem DELETE em promocoes', async () => {
    await expect(poolApi.query('delete from public.promocoes')).rejects.toThrow()
  })
})
