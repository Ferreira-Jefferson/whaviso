// Seguranca do modulo estoque_insumos: isolamento multi-tenant (SEC-001/002), sem DELETE em
// negocio/auditoria (SEC-030), movimento append-only (SEC-033), saldo nunca negativo (check),
// e grants do whaviso_atendente (consumo por venda) via SET ROLE.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarEstoqueRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[estoque_insumos/seguranca] banco inacessivel: PULADO.')

// SET ROLE como literal fixo (sem interpolacao; SEC-080). O role herda os grants reais.
const SET_ROLE = { whaviso_atendente: 'set role whaviso_atendente' } as const
async function sobRole<T>(role: keyof typeof SET_ROLE, fn: (q: typeof poolSuper.query) => Promise<T>): Promise<T> {
  const c = await poolSuper.connect()
  try {
    await c.query(SET_ROLE[role])
    return await fn(c.query.bind(c) as typeof poolSuper.query)
  } finally {
    await c.query('reset role').catch(() => {})
    c.release()
  }
}

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('estoque-seg', 'info'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'estoque-insumos', plugin: criarEstoqueRoutes() }],
  })
  await app.ready()
  return app
}

d('estoque_insumos: seguranca', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let donoA: string, donoB: string, lojaA: string, lojaB: string, insumoA: string

  const chamar = (user: string, loja: string | null, metodo: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/estoque-insumos${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    lojas.push(lojaA, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaB, donoB, 'dono', null)
    app = await montar()
    insumoA = (await chamar(donoA, lojaA, 'POST', '', { nome: 'Arroz', unidade: 'kg', quantidade_inicial: 10 })).json().id
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojas) await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    await limpar(cen)
    await fecharPools()
  })

  it('SEC-001: loja B nao le/edita/movimenta insumo da loja A (404)', async () => {
    expect((await chamar(donoB, lojaB, 'GET', `/${insumoA}`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'PATCH', `/${insumoA}`, { nome: 'Invasor' })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'GET', `/${insumoA}/movimentos`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', '/movimentos', { insumo_id: insumoA, tipo: 'saida', quantidade: 1 })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'GET', '')).json().itens).toHaveLength(0)
    const { rows } = await poolSuper.query('select nome from public.insumos where id = $1', [insumoA])
    expect(rows[0].nome).toBe('Arroz')
  })

  it('SEC-002: x-loja-id de outra conta = 404; loja_id no corpo nao muda a loja', async () => {
    expect((await chamar(donoB, lojaA, 'GET', '')).statusCode).toBe(404)
    const r = await chamar(donoA, lojaA, 'POST', '', { nome: 'X', unidade: 'un', loja_id: lojaB })
    expect(r.statusCode).toBe(400) // campo extra rejeitado (strictObject)
  })

  it('sem autenticacao: 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/estoque-insumos' })).statusCode).toBe(401)
  })

  it('SEC-030: whaviso_api nao tem DELETE em insumos nem movimentos_insumo', async () => {
    await expect(poolApi.query('delete from public.insumos where id = $1', [insumoA])).rejects.toThrow()
    await expect(poolApi.query('delete from public.movimentos_insumo where insumo_id = $1', [insumoA])).rejects.toThrow()
  })

  it('SEC-033: movimentos_insumo e append-only (UPDATE barrado)', async () => {
    await expect(
      poolApi.query('update public.movimentos_insumo set quantidade = 0 where insumo_id = $1', [insumoA]),
    ).rejects.toThrow()
  })

  it('check do banco: quantidade_atual nunca negativa', async () => {
    await expect(
      poolSuper.query('update public.insumos set quantidade_atual = -1 where id = $1', [insumoA]),
    ).rejects.toThrow()
  })

  it('grants do whaviso_atendente: le insumo, decrementa quantidade_atual e insere consumo; nao edita cadastro nem cria insumo', async () => {
    await sobRole('whaviso_atendente', async (q) => {
      // le o saldo
      const sel = await q('select quantidade_atual from public.insumos where id = $1', [insumoA])
      expect(Number(sel.rows[0].quantidade_atual)).toBe(10)
      // decrementa so quantidade_atual
      await expect(
        q('update public.insumos set quantidade_atual = quantidade_atual - 1 where id = $1', [insumoA]),
      ).resolves.toBeDefined()
      // enfileira o movimento de consumo
      await expect(
        q(
          `insert into public.movimentos_insumo (loja_id, insumo_id, tipo, quantidade, quantidade_resultante)
           values ($1, $2, 'consumo', 1, 9)`,
          [lojaA, insumoA],
        ),
      ).resolves.toBeDefined()
      // NAO edita o cadastro (coluna fora do grant)
      await expect(q('update public.insumos set nome = $2 where id = $1', [insumoA, 'Hack'])).rejects.toThrow()
      // NAO cria insumo (sem grant de insert em insumos)
      await expect(
        q(`insert into public.insumos (loja_id, nome, unidade) values ($1, 'Z', 'un')`, [lojaA]),
      ).rejects.toThrow()
      // NAO deleta movimento
      await expect(q('delete from public.movimentos_insumo where insumo_id = $1', [insumoA])).rejects.toThrow()
    })
  })
})
