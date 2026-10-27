// Seguranca do modulo plataforma_cobranca no Postgres local.
//   SEC-003/041: rotas /plataforma/* so para operador; membro de loja e barrado.
//   SEC-001/002: /minha-fatura so devolve a propria conta; conta_id forjado e ignorado; so dono.
//   SEC-030:     whaviso_api nao tem DELETE em assinaturas/faturas (cancelamento e estado).
//   SEC-081:     Zod rejeita entrada malformada (competencia fora do dia 1, valor negativo).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarCobrancaRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[plataforma_cobranca] banco inacessivel: seguranca PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('cobranca-seg', 'error'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'plataforma-cobranca', plugin: criarCobrancaRoutes() }],
  })
  await app.ready()
  return app
}

d('modulo plataforma_cobranca (seguranca)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let operador: string, donoA: string, gerenteA: string, donoB: string
  let contaA: string, lojaA: string, contaB: string, lojaB: string

  const chamar = (user: string | null, metodo: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/plataforma-cobranca${url}`,
      headers: user ? { authorization: `Bearer ${user}` } : {},
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    operador = await criarUsuario(cen)
    await criarOperador(operador)
    donoA = await criarUsuario(cen)
    gerenteA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    contaA = await criarConta(cen, donoA)
    lojaA = await criarLoja(contaA)
    contaB = await criarConta(cen, donoB)
    lojaB = await criarLoja(contaB)
    lojas.push(lojaA, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaA, gerenteA, 'gerente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)

    // Semeia assinatura + fatura para a conta A (direto, sem rota), para a visao do dono.
    const ass = await poolSuper.query<{ id: string }>(
      `insert into public.assinaturas (conta_id, loja_id, status, valor_mensal_centavos, dia_vencimento)
       values ($1, $2, 'ativa', 70000, 10) returning id`, [contaA, lojaA])
    await poolSuper.query(
      `insert into public.faturas (assinatura_id, conta_id, competencia, valor_centavos, vencimento)
       values ($1, $2, '2026-09-01', 70000, '2026-09-10')`, [ass.rows[0]!.id, contaA])
    app = await montar()
  })

  afterAll(async () => {
    await app.close()
    await poolSuper.query(
      `delete from public.eventos where loja_id = any($1::uuid[])
         or entidade_id in (select id from public.assinaturas where conta_id = any($2::uuid[]))
         or entidade_id in (select id from public.faturas where conta_id = any($2::uuid[]))`,
      [lojas, cen.contas],
    ).catch(() => {})
    await poolSuper.query('delete from public.faturas where conta_id = any($1::uuid[])', [cen.contas]).catch(() => {})
    await poolSuper.query('delete from public.assinaturas where conta_id = any($1::uuid[])', [cen.contas]).catch(() => {})
    await limpar(cen)
    await fecharPools()
  })

  it('SEC-003/041: membro de loja (dono) e barrado nas rotas de plataforma (403)', async () => {
    expect((await chamar(donoA, 'GET', '/assinaturas')).statusCode).toBe(403)
    expect((await chamar(donoA, 'POST', '/assinaturas', { conta_id: contaA })).statusCode).toBe(403)
    expect((await chamar(donoA, 'GET', '/faturas')).statusCode).toBe(403)
    expect((await chamar(donoA, 'POST', '/cobranca/apurar-atrasos')).statusCode).toBe(403)
  })

  it('operador passa nas rotas de plataforma (espelho de permissao)', async () => {
    expect((await chamar(operador, 'GET', '/assinaturas')).statusCode).toBe(200)
    expect((await chamar(operador, 'GET', '/faturas')).statusCode).toBe(200)
  })

  it('SEC-003: operador e barrado na rota de conteudo de loja /minha-fatura (403)', async () => {
    expect((await chamar(operador, 'GET', '/minha-fatura')).statusCode).toBe(403)
  })

  it('SEC-001/002: dono ve SO a propria conta; conta_id forjado na query e ignorado', async () => {
    const minhasA = await chamar(donoA, 'GET', '/minha-fatura')
    expect(minhasA.statusCode, minhasA.body).toBe(200)
    const itensA = minhasA.json()
    expect(itensA).toHaveLength(1)
    // DTO enxuto: nunca expoe conta_id/assinatura_id de ninguem (SEC-003).
    expect(Object.keys(itensA[0]).sort()).toEqual(
      ['competencia', 'id', 'pago_em', 'status', 'valor_centavos', 'vencimento'])

    // Dono B nao enxerga a conta A, mesmo forjando ?conta_id=contaA.
    const forjado = await chamar(donoB, 'GET', `/minha-fatura?conta_id=${contaA}`)
    expect(forjado.statusCode).toBe(200)
    expect(forjado.json()).toHaveLength(0)
  })

  it('SEC-041: membro que nao e dono (gerente) recebe 403 em /minha-fatura', async () => {
    expect((await chamar(gerenteA, 'GET', '/minha-fatura')).statusCode).toBe(403)
  })

  it('sem autenticacao: 401', async () => {
    expect((await chamar(null, 'GET', '/assinaturas')).statusCode).toBe(401)
    expect((await chamar(null, 'GET', '/minha-fatura')).statusCode).toBe(401)
  })

  it('SEC-081: Zod rejeita competencia que nao e dia 1 e valor negativo (400)', async () => {
    const compRuim = await chamar(operador, 'POST', '/cobranca/gerar-faturas', { competencia: '2026-09-15' })
    expect(compRuim.statusCode).toBe(400)
    const valorRuim = await chamar(operador, 'POST', '/assinaturas', { conta_id: randomUUID(), valor_mensal_centavos: -1 })
    expect(valorRuim.statusCode).toBe(400)
  })

  it('SEC-030: whaviso_api nao tem DELETE em assinaturas nem faturas', async () => {
    const negado = /permission denied|permiss/
    await expect(poolApi.query('delete from public.assinaturas where false')).rejects.toThrow(negado)
    await expect(poolApi.query('delete from public.faturas where false')).rejects.toThrow(negado)
  })
})
