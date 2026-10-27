// Seguranca do modulo caixa (SEC-001/002/003/030/080 + regra de uma sessao aberta) no Postgres local.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarCaixaRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[caixa] banco inacessivel: seguranca PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('caixa-seg', 'error'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'caixa', plugin: criarCaixaRoutes() }],
  })
  await app.ready()
  return app
}

d('modulo caixa (seguranca)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let donoA: string, donoB: string, operador: string, lojaA: string, lojaB: string, caixaA: string

  const chamar = (user: string, lj: string | null, metodo: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/caixa${url}`,
      headers: { authorization: `Bearer ${user}`, ...(lj ? { 'x-loja-id': lj } : {}) },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    operador = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    lojas.push(lojaA, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaB, donoB, 'dono', null)
    await criarOperador(operador)
    app = await montar()
    caixaA = (await chamar(donoA, lojaA, 'POST', '/abrir', { saldo_inicial_centavos: 1000 })).json().id
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojas) {
      await poolSuper.query('delete from public.movimentos_caixa where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.caixas where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  it('SEC-001: loja B nao le, lanca nem fecha o caixa da loja A (404); caixa segue intacto', async () => {
    expect((await chamar(donoB, lojaB, 'GET', `/${caixaA}/relatorio`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', `/${caixaA}/movimentos`, { tipo: 'suprimento', valor_centavos: 100 })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', `/${caixaA}/fechar`, { saldo_informado_centavos: 0 })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'GET', '/aberto')).json().caixa).toBeNull()
    expect((await chamar(donoA, lojaA, 'GET', `/${caixaA}/relatorio`)).statusCode).toBe(200)
  })

  it('SEC-002: x-loja-id de outra conta = 404; loja_id no corpo e rejeitado (400)', async () => {
    expect((await chamar(donoB, lojaA, 'GET', '/aberto')).statusCode).toBe(404)
    const forjado = await chamar(donoA, lojaA, 'POST', '/abrir', { saldo_inicial_centavos: 0, loja_id: lojaB })
    expect(forjado.statusCode).toBe(400)
  })

  it('SEC-003: operador da plataforma e negado (403/404)', async () => {
    expect([403, 404]).toContain((await chamar(operador, lojaA, 'GET', '/aberto')).statusCode)
    expect([403, 404]).toContain((await chamar(operador, lojaA, 'POST', '/abrir', { saldo_inicial_centavos: 0 })).statusCode)
  })

  it('sem autenticacao: 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/v1/caixa/aberto' })
    expect(r.statusCode).toBe(401)
  })

  it('SEC-030: whaviso_api nao tem DELETE em caixas nem movimentos_caixa', async () => {
    const negado = /permission denied|permiss/
    await expect(poolApi.query('delete from public.caixas where false')).rejects.toThrow(negado)
    await expect(poolApi.query('delete from public.movimentos_caixa where false')).rejects.toThrow(negado)
  })

  it('movimentos_caixa e append-only: whaviso_api nao tem UPDATE', async () => {
    const negado = /permission denied|permiss/
    await expect(poolApi.query('update public.movimentos_caixa set motivo = $1 where false', ['x'])).rejects.toThrow(negado)
  })

  it('regra: no maximo UMA sessao aberta por loja (indice parcial unico no banco)', async () => {
    await expect(
      poolSuper.query(
        `insert into public.caixas (loja_id, aberto_por_user_id, saldo_inicial_centavos) values ($1, $2, 0)`,
        [lojaA, donoA],
      ),
    ).rejects.toThrow(/caixas_uma_aberta_por_loja|duplicate key/)
  })

  it('SEC-080: texto de SQL em observacao e tratado como dado', async () => {
    const r = await chamar(donoA, lojaA, 'POST', `/${caixaA}/fechar`, {
      saldo_informado_centavos: 1000,
      observacoes: "x'; drop table public.caixas; --",
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().observacoes).toContain('drop table')
    expect((await poolSuper.query('select 1 from public.caixas where id = $1', [caixaA])).rowCount).toBe(1)
  })
})
