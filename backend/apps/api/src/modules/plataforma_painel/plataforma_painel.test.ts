// Integracao do painel do operador contra o Postgres local: escopo (401/403), numeros contra
// fixtures calculadas a mao (por DELTA, pois o banco de teste e compartilhado), validacao de
// `meses` (SEC-080), allowlist de chaves do payload (SEC-003) e cache.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper, type Cenario,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarPlataformaPainelRoutes } from './routes'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

const CHAVES_RESUMO = [
  'arpa_centavos', 'assinaturas', 'calculado_em', 'churn_contas', 'churn_mrr', 'contas_ativas',
  'conversao_funil', 'conversao_trial', 'inadimplencia', 'lojas_ativas', 'mes', 'mrr_centavos',
  'novas_contas_mes', 'receita_realizada_centavos',
]
const CHAVES_MES = [
  'assinaturas_ativas', 'cancelamentos', 'churn_contas', 'mes', 'mrr_centavos', 'novas_contas',
  'receita_realizada_centavos',
]

type App = Awaited<ReturnType<typeof construirApp>>

d('modulo plataforma_painel', () => {
  const cenario: Cenario = novoCenario()
  const logs: string[] = []
  let app: App
  let dono: string
  let operador: string
  let contaA: string
  let contaB: string
  let lojaA: string
  const prospectos: string[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
  async function get(user: string | undefined, url: string): Promise<{ status: number; corpo: any }> {
    const res = await app.inject({
      method: 'GET', url: `/v1/plataforma-painel${url}`,
      headers: user ? { authorization: `Bearer ${user}` } : {},
    })
    return { status: res.statusCode, corpo: res.body ? res.json() : null }
  }

  beforeAll(async () => {
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado',
      SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173',
      RATE_LIMIT_MAX: '100000',
    })
    dono = await criarUsuario(cenario)
    const donoB = await criarUsuario(cenario)
    operador = await criarUsuario(cenario)
    contaA = await criarConta(cenario, dono)
    contaB = await criarConta(cenario, donoB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarOperador(operador, 'operador')
    lojaA = await criarLoja(contaA)
    void lojaA
    const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })
    app = await construirApp({
      env, pool: poolApi, logger: criarLogger('plataforma-painel-teste', 'info', destino),
      verificador: verificadorFake,
      // ttl 0: sempre recalcula (o teste de cache usa outra instancia)
      modulos: [{ prefixo: 'plataforma-painel', plugin: criarPlataformaPainelRoutes({ ttlMs: 0 }) }],
    })
    await app.ready()
  })

  afterAll(async () => {
    if (app) await app.close()
    await poolSuper.query('delete from public.faturas where conta_id = any($1)', [[contaA, contaB]])
    await poolSuper.query('delete from public.assinaturas where conta_id = any($1)', [[contaA, contaB]])
    if (prospectos.length) await poolSuper.query('delete from public.prospectos where id = any($1)', [prospectos])
    await limpar(cenario)
    await fecharPools()
  })

  it('401 sem token; 403 para membro de loja em todas as rotas (SEC-001/041)', async () => {
    expect((await get(undefined, '/resumo')).status).toBe(401)
    for (const url of ['/resumo', '/serie', '/serie?meses=3']) {
      const r = await get(dono, url)
      expect(r.status, url).toBe(403)
      expect(r.corpo.error.code).toBe('proibido')
    }
  })

  it('numeros do mes conferem com fixtures a mao e o payload so tem chaves da allowlist', async () => {
    const antes = (await get(operador, '/resumo')).corpo
    const serieAntes = (await get(operador, '/serie?meses=2')).corpo

    // A: ativa 70000 (iniciada ha 60 dias), fatura atrasada 10000 e fatura paga 70000 agora.
    const a = await poolSuper.query<{ id: string }>(
      `insert into public.assinaturas (conta_id, status, valor_mensal_centavos, inicio_em)
       values ($1, 'ativa', 70000, now() - interval '60 days') returning id`, [contaA])
    await poolSuper.query(
      `insert into public.faturas (assinatura_id, conta_id, competencia, valor_centavos, vencimento, status)
       values ($1, $2, '2000-01-01', 10000, '2000-01-10', 'atrasada')`, [a.rows[0]!.id, contaA])
    await poolSuper.query(
      `insert into public.faturas (assinatura_id, conta_id, competencia, valor_centavos, vencimento, status, pago_em)
       values ($1, $2, '2000-02-01', 70000, '2000-02-10', 'paga', now())`, [a.rows[0]!.id, contaA])
    // B: trial (nao conta no MRR) e uma cancelada agora (iniciada ha 60 dias, 30000).
    await poolSuper.query(
      "insert into public.assinaturas (conta_id, status, valor_mensal_centavos, trial_ate) values ($1, 'trial', 99999, now() + interval '5 days')",
      [contaB])
    await poolSuper.query(
      `insert into public.assinaturas (conta_id, status, valor_mensal_centavos, inicio_em, cancelada_em)
       values ($1, 'cancelada', 30000, now() - interval '60 days', now())`, [contaB])
    // Funil: 2 prospectos novos no mes, 1 deles ativo.
    for (const estagio of ['novo', 'ativo']) {
      const p = await poolSuper.query<{ id: string }>(
        'insert into public.prospectos (nome_restaurante, estagio) values ($1, $2) returning id',
        [`Painel ${randomUUID().slice(0, 6)}`, estagio])
      prospectos.push(p.rows[0]!.id)
    }

    const r = await get(operador, '/resumo')
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    const depois = r.corpo
    expect(Object.keys(depois).sort()).toEqual(CHAVES_RESUMO)
    expect(depois.mrr_centavos - antes.mrr_centavos).toBe(70000) // trial e cancelada fora
    expect(depois.assinaturas.ativa - antes.assinaturas.ativa).toBe(1)
    expect(depois.assinaturas.trial - antes.assinaturas.trial).toBe(1)
    expect(depois.assinaturas.cancelada - antes.assinaturas.cancelada).toBe(1)
    expect(depois.contas_ativas - antes.contas_ativas).toBe(1)
    expect(depois.lojas_ativas - antes.lojas_ativas).toBe(1) // lojaA coberta por assinatura ativa
    expect(depois.novas_contas_mes).toBeGreaterThanOrEqual(2) // contaA e contaB criadas neste mes
    expect(depois.inadimplencia.valor_centavos - antes.inadimplencia.valor_centavos).toBe(10000)
    expect(depois.inadimplencia.contas - antes.inadimplencia.contas).toBe(1)
    expect(depois.receita_realizada_centavos - antes.receita_realizada_centavos).toBe(70000)
    expect(Number.isInteger(depois.mrr_centavos)).toBe(true)
    expect(depois.mes).toMatch(/^\d{4}-\d{2}$/)
    for (const k of ['churn_contas', 'churn_mrr', 'conversao_funil', 'conversao_trial']) {
      const v = depois[k]
      expect(v === null || (v >= 0 && v <= 1), k).toBe(true)
    }

    const s = (await get(operador, '/serie?meses=2')).corpo
    expect(Object.keys(s).sort()).toEqual(['calculado_em', 'meses', 'mrr_aproximado'])
    expect(s.meses).toHaveLength(2)
    expect(s.mrr_aproximado).toBe(true)
    for (const m of s.meses) expect(Object.keys(m).sort()).toEqual(CHAVES_MES)
    const cur = s.meses[1]
    const curAntes = serieAntes.meses[1]
    expect(cur.mes).toBe(depois.mes)
    expect(cur.mrr_centavos - curAntes.mrr_centavos).toBe(70000)
    expect(cur.assinaturas_ativas - curAntes.assinaturas_ativas).toBe(1)
    expect(cur.cancelamentos - curAntes.cancelamentos).toBe(1)
    expect(cur.novas_contas).toBe(depois.novas_contas_mes)
    expect(cur.receita_realizada_centavos - curAntes.receita_realizada_centavos).toBe(70000)
  })

  it('meses validado: 1..24 inteiro; chaves extras e injecao rejeitadas (SEC-080/081)', async () => {
    expect((await get(operador, '/serie')).corpo.meses).toHaveLength(12)
    expect((await get(operador, '/serie?meses=24')).corpo.meses).toHaveLength(24)
    expect((await get(operador, '/serie?meses=1')).corpo.meses).toHaveLength(1)
    for (const q of ['meses=0', 'meses=25', 'meses=1.5', 'meses=abc', `meses=${encodeURIComponent('1; drop table contas')}`, 'conta_id=x']) {
      expect((await get(operador, `/serie?${q}`)).status, q).toBe(400)
    }
  })

  it('nao loga dado sensivel', () => {
    const tudo = logs.join('\n')
    expect(/telefone|pix|token_cifrado/i.test(tudo)).toBe(false)
  })

  it('cache: segunda leitura dentro do TTL devolve o mesmo calculado_em', async () => {
      const cen = novoCenario()
      const op = await criarUsuario(cen)
      await criarOperador(op, 'operador')
      const env = envSchema.parse({
        DATABASE_URL: 'postgres://ignorado', SUPABASE_URL: 'https://exemplo.supabase.co',
        APP_URL: 'http://localhost:5173', RATE_LIMIT_MAX: '100000',
      })
      let t = 1_700_000_000_000
      const app = await construirApp({
        env, pool: poolApi, logger: criarLogger('plataforma-painel-cache', 'silent'),
        verificador: verificadorFake,
        modulos: [{ prefixo: 'plataforma-painel', plugin: criarPlataformaPainelRoutes({ ttlMs: 60_000, agora: () => t }) }],
      })
      await app.ready()
      const ler = async () => (await app.inject({
        method: 'GET', url: '/v1/plataforma-painel/resumo', headers: { authorization: `Bearer ${op}` },
      })).json().calculado_em as string
      const a = await ler()
      t += 30_000
      expect(await ler()).toBe(a)
      t += 31_000
      expect(await ler()).not.toBe(a)
      await app.close()
      await limpar(cen)
    })
})
