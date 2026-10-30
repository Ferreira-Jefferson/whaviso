// Integracao da Central de Evals (api) contra o Postgres local: escopo de operador, validacao de
// caso por tipo, enfileiramento, cancelamento, detalhe, comparacao e baseline.
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
import { criarPlataformaEvalsRoutes } from './routes'
import * as repo from './repo'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

type App = Awaited<ReturnType<typeof construirApp>>

d('modulo plataforma_evals', () => {
  const cenario: Cenario = novoCenario()
  const suites: string[] = []
  let app: App
  let dono: string
  let operador: string
  let suporte: string
  let lojaId: string
  let lojaInativa: string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
  async function chamar(user: string | undefined, metodo: 'GET' | 'POST' | 'PATCH', url: string, corpo?: unknown): Promise<{ status: number; corpo: any }> {
    const res = await app.inject({
      method: metodo, url: `/v1/plataforma-evals${url}`,
      headers: user ? { authorization: `Bearer ${user}` } : {},
      ...(corpo === undefined ? {} : { payload: corpo as object }),
    })
    return { status: res.statusCode, corpo: res.body ? res.json() : null }
  }

  async function novaSuite(tipo: string, nome = 'Suite de teste') {
    const r = await chamar(operador, 'POST', '/suites', { nome, tipo })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    suites.push(r.corpo.id)
    return r.corpo as { id: string; tipo: string }
  }

  async function novaExecucao(suiteId: string) {
    const r = await chamar(operador, 'POST', '/execucoes', { suiteId, lojaAlvoId: lojaId, modelo: 'm1' })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    return r.corpo as { id: string; status: string; disparada_por: string }
  }

  beforeAll(async () => {
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado',
      SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173',
      RATE_LIMIT_MAX: '100000',
    })
    dono = await criarUsuario(cenario)
    operador = await criarUsuario(cenario)
    suporte = await criarUsuario(cenario)
    const conta = await criarConta(cenario, dono)
    await criarMembro(conta, dono, 'dono', null)
    await criarOperador(operador, 'operador')
    await poolSuper.query(
      'insert into public.operadores (id, user_id, nome, papel) values ($1,$2,$3,$4)',
      [randomUUID(), suporte, 'Suporte de teste', 'suporte'],
    )
    lojaId = await criarLoja(conta)
    lojaInativa = await criarLoja(conta, false)
    const destino = new Writable({ write(_c: Buffer, _e, cb) { cb() } })
    app = await construirApp({
      env, pool: poolApi, logger: criarLogger('plataforma-evals-teste', 'info', destino),
      verificador: verificadorFake,
      modulos: [
        { prefixo: 'plataforma-evals', plugin: criarPlataformaEvalsRoutes() },
        // Rota de operador SEM `acesso: 'plataforma'`: o escopo deve negar (falha fechada).
        {
          prefixo: 'sem-marca',
          plugin: async (app2) => {
            app2.get('/x', { preHandler: [app2.autenticar, app2.escopoOperador] }, async () => ({ ok: true }))
          },
        },
      ],
    })
    await app.ready()
  })

  afterAll(async () => {
    if (app) await app.close()
    const ex = await poolSuper.query<{ id: string }>('select id from public.eval_execucoes where suite_id = any($1)', [suites])
    const ids = ex.rows.map((r) => r.id)
    await poolSuper.query('update public.eval_execucoes set baseline_execucao_id = null where id = any($1)', [ids])
    await poolSuper.query('delete from public.eval_resultados where execucao_id = any($1)', [ids])
    await poolSuper.query('delete from public.eval_execucoes where id = any($1)', [ids])
    await poolSuper.query('delete from public.eval_casos where suite_id = any($1)', [suites])
    await poolSuper.query('delete from public.eval_suites where id = any($1)', [suites])
    await limpar(cenario)
    await fecharPools()
  })

  it('escopo: 401 sem token; 403 membro de loja, suporte sem permissao e rota sem marca plataforma', async () => {
    expect((await chamar(undefined, 'GET', '/suites')).status).toBe(401)
    expect((await chamar(dono, 'GET', '/suites')).status).toBe(403)
    expect((await chamar(dono, 'POST', '/suites', { nome: 'x', tipo: 'nlu_intencao' })).status).toBe(403)
    expect((await chamar(suporte, 'GET', '/suites')).status).toBe(403)
    expect((await chamar(suporte, 'POST', '/suites', { nome: 'x', tipo: 'nlu_intencao' })).status).toBe(403)
    const res = await app.inject({ method: 'GET', url: '/v1/sem-marca/x', headers: { authorization: `Bearer ${operador}` } })
    expect(res.statusCode).toBe(403)
  })

  it('suites: cria, lista com filtro ativo, atualiza; tipo e imutavel (schema estrito)', async () => {
    const s = await novaSuite('nlu_intencao', 'Suite NLU')
    const lista = await chamar(operador, 'GET', '/suites?ativo=true')
    expect(lista.status).toBe(200)
    expect(lista.corpo.map((x: { id: string }) => x.id)).toContain(s.id)
    const up = await chamar(operador, 'PATCH', `/suites/${s.id}`, { ativo: false, descricao: 'desc' })
    expect(up.status).toBe(200)
    expect(up.corpo).toMatchObject({ ativo: false, descricao: 'desc', tipo: 'nlu_intencao' })
    const inativas = await chamar(operador, 'GET', '/suites?ativo=false')
    expect(inativas.corpo.map((x: { id: string }) => x.id)).toContain(s.id)
    expect((await chamar(operador, 'PATCH', `/suites/${s.id}`, { tipo: 'harness_turno' })).status).toBe(400)
    expect((await chamar(operador, 'PATCH', `/suites/${randomUUID()}`, { ativo: true })).status).toBe(404)
  })

  it('casos: valida entrada/esperado por tipo (valido e invalido) e revalida no PATCH', async () => {
    const nlu = await novaSuite('nlu_intencao')
    const ok = await chamar(operador, 'POST', `/suites/${nlu.id}/casos`, {
      nome: 'c1', entrada: { texto: 'quero uma pizza' }, esperado: { tipo: 'pedido', itens: ['pizza'] },
    })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(200)
    expect(ok.corpo).toMatchObject({ suite_id: nlu.id, peso: 1, origem: 'manual', ativo: true })

    for (const corpo of [
      { nome: 'ruim', entrada: { texto: 'x' }, esperado: {} },
      { nome: 'ruim', entrada: { naoExiste: 1 }, esperado: { tipo: 'pedido' } },
      { nome: 'ruim', entrada: { texto: 'x' }, esperado: { tipo: 'pedido', extra: true } },
    ]) {
      const r = await chamar(operador, 'POST', `/suites/${nlu.id}/casos`, corpo)
      expect(r.status).toBe(400)
      expect(r.corpo.error.code).toBe('entrada_invalida')
    }

    const harness = await novaSuite('harness_turno')
    expect((await chamar(operador, 'POST', `/suites/${harness.id}/casos`, {
      nome: 'h', entrada: { texto: 'oi', persona: 'cliente' }, esperado: { handoffEsperado: true },
    })).status).toBe(200)
    const faith = await novaSuite('rag_faithfulness')
    expect((await chamar(operador, 'POST', `/suites/${faith.id}/casos`, {
      nome: 'f', entrada: { consulta: 'qual o horario?' },
    })).status).toBe(200)
    const retr = await novaSuite('rag_retrieval')
    expect((await chamar(operador, 'POST', `/suites/${retr.id}/casos`, { nome: 'r', entrada: {} })).status).toBe(200)
    expect((await chamar(operador, 'POST', `/suites/${retr.id}/casos`, { nome: 'r', entrada: { a: 1 } })).status).toBe(400)

    const up = await chamar(operador, 'PATCH', `/casos/${ok.corpo.id}`, { peso: 2, entrada: { texto: 'outra' } })
    expect(up.status).toBe(200)
    expect(up.corpo).toMatchObject({ peso: 2, entrada: { texto: 'outra' }, esperado: { tipo: 'pedido', itens: ['pizza'] } })
    expect((await chamar(operador, 'PATCH', `/casos/${ok.corpo.id}`, { entrada: { errado: 1 } })).status).toBe(400)
    expect((await chamar(operador, 'PATCH', `/casos/${ok.corpo.id}`, { ativo: false })).corpo.ativo).toBe(false)
    expect((await chamar(operador, 'GET', `/suites/${nlu.id}/casos`)).corpo).toHaveLength(1)
    expect((await chamar(operador, 'POST', `/suites/${randomUUID()}/casos`, { nome: 'x', entrada: {} })).status).toBe(404)
  })

  it('lojas-alvo: lista id e nome', async () => {
    const r = await chamar(operador, 'GET', '/lojas-alvo')
    expect(r.status).toBe(200)
    expect(r.corpo.find((l: { id: string }) => l.id === lojaId)).toEqual({ id: lojaId, nome: 'Loja de teste' })
  })

  it('execucoes: enfileira (fila + disparada_por), valida suite/loja; cancela so da fila', async () => {
    const s = await novaSuite('nlu_intencao')
    const e = await novaExecucao(s.id)
    expect(e).toMatchObject({ status: 'fila', disparada_por: operador, modelo: 'm1', suite_id: s.id, loja_alvo_id: lojaId })
    expect((await chamar(operador, 'POST', '/execucoes', { suiteId: randomUUID(), lojaAlvoId: lojaId })).status).toBe(404)
    expect((await chamar(operador, 'POST', '/execucoes', { suiteId: s.id, lojaAlvoId: randomUUID() })).status).toBe(404)
    expect((await chamar(operador, 'POST', '/execucoes', { suiteId: s.id, lojaAlvoId: lojaInativa })).status).toBe(200)

    const c = await chamar(operador, 'POST', `/execucoes/${e.id}/cancelar`)
    expect(c.status).toBe(200)
    expect(c.corpo.status).toBe('cancelada')
    const de_novo = await chamar(operador, 'POST', `/execucoes/${e.id}/cancelar`)
    expect(de_novo.status).toBe(409)
    expect(de_novo.corpo.error.code).toBe('conflito')

    const e2 = await novaExecucao(s.id)
    await poolSuper.query("update public.eval_execucoes set status = 'rodando' where id = $1", [e2.id])
    expect((await chamar(operador, 'POST', `/execucoes/${e2.id}/cancelar`)).status).toBe(409)
    expect((await chamar(operador, 'POST', `/execucoes/${randomUUID()}/cancelar`)).status).toBe(404)
  })

  it('execucoes: lista com filtros (mais nova primeiro) e detalhe com resultados (repo round-trip)', async () => {
    const s = await novaSuite('nlu_intencao')
    const caso = await repo.criarCaso(poolApi, {
      suiteId: s.id, nome: 'caso', entrada: { texto: 'a' }, esperado: { tipo: 't' }, peso: 1, origem: 'manual',
    })
    const e1 = await novaExecucao(s.id)
    const e2 = await novaExecucao(s.id)
    await poolSuper.query(
      `insert into public.eval_resultados (execucao_id, caso_id, status, scores) values ($1, $2, 'passou', '{"acerto":1}')`,
      [e1.id, caso.id],
    )
    const lista = await chamar(operador, 'GET', `/execucoes?suiteId=${s.id}&status=fila&modelo=m1`)
    expect(lista.status).toBe(200)
    expect(lista.corpo.map((x: { id: string }) => x.id)).toEqual([e2.id, e1.id])
    expect((await chamar(operador, 'GET', `/execucoes?suiteId=${s.id}&status=concluida`)).corpo).toEqual([])
    expect((await chamar(operador, 'GET', '/execucoes?outro=1')).status).toBe(400)

    const det = await chamar(operador, 'GET', `/execucoes/${e1.id}`)
    expect(det.status).toBe(200)
    expect(det.corpo.execucao.id).toBe(e1.id)
    expect(det.corpo.resultados).toHaveLength(1)
    expect(det.corpo.resultados[0]).toMatchObject({ caso_id: caso.id, status: 'passou', scores: { acerto: 1 } })
    expect((await chamar(operador, 'GET', `/execucoes/${randomUUID()}`)).status).toBe(404)
  })

  it('comparar: deltas e diff por caso; baseline so entre execucoes da mesma suite', async () => {
    const s = await novaSuite('nlu_intencao')
    const outra = await novaSuite('nlu_intencao')
    const c1 = await repo.criarCaso(poolApi, { suiteId: s.id, nome: 'alfa', entrada: { texto: 'a' }, esperado: { tipo: 't' }, peso: 1, origem: 'manual' })
    const c2 = await repo.criarCaso(poolApi, { suiteId: s.id, nome: 'beta', entrada: { texto: 'b' }, esperado: { tipo: 't' }, peso: 1, origem: 'manual' })
    const a = await novaExecucao(s.id)
    const b = await novaExecucao(s.id)
    const resumo = (o: object) => JSON.stringify({
      total: 2, passou: 1, falhou: 1, erro: 0, scoreMedio: 0.5, porMetrica: { acerto: 0.5 },
      tokensIn: 100, tokensOut: 50, custoCentavos: 5, latenciaP50Ms: 300, latenciaP95Ms: 900, ...o,
    })
    await poolSuper.query('update public.eval_execucoes set resumo = $2::jsonb where id = $1', [a.id, resumo({})])
    await poolSuper.query('update public.eval_execucoes set resumo = $2::jsonb where id = $1', [b.id, resumo({
      passou: 2, falhou: 0, scoreMedio: 0.9, porMetrica: { acerto: 0.9 }, tokensIn: 150, custoCentavos: 4, latenciaP50Ms: 250,
    })])
    const ins = (exec: string, caso: string, status: string, score: number) => poolSuper.query(
      'insert into public.eval_resultados (execucao_id, caso_id, status, scores) values ($1,$2,$3,$4::jsonb)',
      [exec, caso, status, JSON.stringify({ acerto: score })],
    )
    await ins(a.id, c1.id, 'passou', 1)
    await ins(a.id, c2.id, 'falhou', 0)
    await ins(b.id, c1.id, 'passou', 1)
    await ins(b.id, c2.id, 'passou', 0.8)

    const r = await chamar(operador, 'POST', '/execucoes/comparar', { execucaoA: a.id, execucaoB: b.id })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(r.corpo.execucaoA.id).toBe(a.id)
    expect(r.corpo.deltas).toMatchObject({
      scoreMedio: 0.4, passou: 1, falhou: -1, erro: 0, tokensIn: 50, custoCentavos: -1,
      latenciaP50Ms: -50, latenciaP95Ms: 0, porMetrica: { acerto: 0.4 },
    })
    expect(r.corpo.casos).toEqual([
      { caso_id: c1.id, nome: 'alfa', statusA: 'passou', statusB: 'passou', deltaScore: 0, mudou: false },
      { caso_id: c2.id, nome: 'beta', statusA: 'falhou', statusB: 'passou', deltaScore: 0.8, mudou: true },
    ])
    expect((await chamar(operador, 'POST', '/execucoes/comparar', { execucaoA: a.id, execucaoB: randomUUID() })).status).toBe(404)

    const base = await chamar(operador, 'POST', '/execucoes/baseline', { execucaoId: b.id, baselineId: a.id })
    expect(base.status).toBe(200)
    expect(base.corpo.baseline_execucao_id).toBe(a.id)
    expect((await chamar(operador, 'POST', '/execucoes/baseline', { execucaoId: b.id, baselineId: b.id })).status).toBe(400)
    const e3 = await novaExecucao(outra.id)
    expect((await chamar(operador, 'POST', '/execucoes/baseline', { execucaoId: b.id, baselineId: e3.id })).status).toBe(400)
    expect((await chamar(suporte, 'POST', '/execucoes/baseline', { execucaoId: b.id, baselineId: a.id })).status).toBe(403)
  })
})
