// F5 realtime-sse: integracao contra whaviso_dev (LISTEN/NOTIFY real, HTTP real).
// SEC-001 (isolamento entre lojas), SEC-003 (operador), SEC-040 (token), SEC-101 (limites),
// reconexao do LISTEN com resync, Last-Event-ID e carga leve (1 conexao LISTEN, N clientes).
import { describe, it, expect, afterAll, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { notificar } from '@whaviso/shared/db'
import {
  bancoAcessivel, fecharPools, poolApi, poolSuper, novoCenario, criarUsuario, criarConta,
  criarLoja, criarMembro, criarOperador, limpar, type Cenario,
} from './db'
import { tratadorDeErros } from '../src/shared/http_errors'
import { autenticarPlugin, type Verificador } from '../src/shared/auth'
import { escopoLojaPlugin, criarLeitorEscopoSql } from '../src/shared/tenant'
import { escopoOperadorPlugin } from '../src/shared/operador'
import { realtimePlugin, type OpcoesRealtime } from '../src/shared/realtime'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[F5] whaviso_dev inacessivel: testes de realtime PULADOS.')

const URL_DB = `postgresql://whaviso_api:whaviso_api_dev@${process.env.PGHOST ?? '127.0.0.1'}:5432/${process.env.PGDATABASE ?? 'whaviso_dev'}`

/** Token fake com forma de JWT: o verificador de teste le sub/exp do payload. */
function token(sub: string, expEmSeg = 3600): string {
  const p = Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + expEmSeg })).toString('base64url')
  return `h.${p}.s`
}
const verificador: Verificador = {
  verificar: async (t) => {
    const p = JSON.parse(Buffer.from(t.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub: string; exp: number }
    if (!p.sub || p.exp * 1000 <= Date.now()) throw new Error('expirado')
    return { sub: p.sub }
  },
}

interface Cliente {
  status: number
  headers: Headers
  texto(): string
  esperar(trecho: string, ms?: number): Promise<void>
  terminou(): boolean
  fechar(): void
}

async function abrir(base: string, headers: Record<string, string>, caminho = '/realtime/stream'): Promise<Cliente> {
  const ctrl = new AbortController()
  const res = await fetch(base + caminho, { headers, signal: ctrl.signal })
  let buf = ''
  let fim = false
  if (res.status === 200 && res.body) {
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
        }
      } catch {
        // abortado
      }
      fim = true
    })()
  } else {
    buf = await res.text()
  }
  return {
    status: res.status,
    headers: res.headers,
    texto: () => buf,
    terminou: () => fim,
    fechar: () => ctrl.abort(),
    esperar: async (trecho, ms = 4000) => {
      const t0 = Date.now()
      while (!buf.includes(trecho)) {
        if (Date.now() - t0 > ms) throw new Error(`timeout esperando "${trecho}"; recebido: ${buf.slice(0, 300)}`)
        await new Promise((r) => setTimeout(r, 20))
      }
    },
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pedido = (loja: string, status = 'novo') => ({ pedido_id: randomUUID(), loja_id: loja, status })

d('realtime SSE (integracao)', () => {
  let app: FastifyInstance
  let base = ''
  let cenario: Cenario
  const abertos: Cliente[] = []

  async function montar(opcoes: Partial<OpcoesRealtime> = {}) {
    app = Fastify({ logger: false })
    app.setErrorHandler(tratadorDeErros)
    const leitor = criarLeitorEscopoSql(poolApi)
    await app.register(autenticarPlugin, { verificador })
    await app.register(escopoLojaPlugin, { leitor })
    await app.register(escopoOperadorPlugin, { leitor })
    await app.register(realtimePlugin, { connectionString: URL_DB, backoffMinMs: 50, ...opcoes })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const addr = app.server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  }
  async function cli(user: string, extra: Record<string, string> = {}, exp = 3600) {
    const c = await abrir(base, { authorization: `Bearer ${token(user, exp)}`, ...extra })
    abertos.push(c)
    return c
  }
  async function duasLojas() {
    cenario = novoCenario()
    const uA = await criarUsuario(cenario)
    const cA = await criarConta(cenario, uA)
    const lA = await criarLoja(cA)
    await criarMembro(cA, uA, 'dono', lA)
    const uB = await criarUsuario(cenario)
    const cB = await criarConta(cenario, uB)
    const lB = await criarLoja(cB)
    await criarMembro(cB, uB, 'dono', lB)
    return { uA, lA, uB, lB }
  }

  afterEach(async () => {
    for (const c of abertos.splice(0)) c.fechar()
    if (app) await app.close()
    if (cenario) await limpar(cenario)
  })
  afterAll(async () => {
    await fecharPools()
  })

  it('SEC-040: sem token, token invalido/expirado ou sem exp -> 401', async () => {
    const { uA } = await duasLojas()
    await montar()
    expect((await abrir(base, {})).status).toBe(401)
    expect((await abrir(base, { authorization: 'Bearer lixo' })).status).toBe(401)
    expect((await abrir(base, { authorization: `Bearer ${token(uA, -10)}` })).status).toBe(401)
    expect(app.hubRealtime.total()).toBe(0)
  })

  it('headers SSE corretos e abertura com retry', async () => {
    const { uA } = await duasLojas()
    await montar()
    const c = await cli(uA)
    expect(c.status).toBe(200)
    expect(c.headers.get('content-type')).toContain('text/event-stream')
    expect(c.headers.get('cache-control')).toContain('no-cache')
    expect(c.headers.get('x-accel-buffering')).toBe('no')
    await c.esperar('retry: 3000')
  })

  it('SEC-001: NOTIFY da loja A chega so ao cliente A; loja_id forjado e ignorado', async () => {
    const { uA, lA, uB, lB } = await duasLojas()
    await montar()
    const a = await cli(uA, { 'x-loja-id': lB }) // forjado: loja alheia -> 404
    expect(a.status).toBe(404)
    const a2 = await cli(uA)
    const b = await cli(uB)
    // query forjada nao muda nada
    const forjado = await abrir(base, { authorization: `Bearer ${token(uB)}` }, `/realtime/stream?loja_id=${lA}`)
    abertos.push(forjado)
    await a2.esperar('retry:')
    await b.esperar('retry:')
    await dormir(300) // garante LISTEN ativo
    await notificar(poolApi, { tipo: 'pedido.atualizado', loja_id: lA, payload: pedido(lA) })
    await a2.esperar('event: pedido.atualizado')
    expect(a2.texto()).toContain(lA)
    await notificar(poolApi, { tipo: 'pedido.atualizado', loja_id: lB, payload: pedido(lB) })
    await b.esperar('event: pedido.atualizado')
    await forjado.esperar('event: pedido.atualizado')
    expect(b.texto()).not.toContain(lA)
    expect(forjado.texto()).not.toContain(lA)
    expect(a2.texto()).not.toContain(lB)
  })

  it('SEC-003: operador sem vinculo de loja nao assina (403)', async () => {
    const { lA } = await duasLojas()
    const op = await criarUsuario(cenario)
    await criarOperador(op)
    await montar()
    const c = await cli(op)
    expect(c.status).toBe(403)
    await dormir(100)
    await notificar(poolApi, { tipo: 'pedido.atualizado', loja_id: lA, payload: pedido(lA) })
    await dormir(200)
    expect(c.texto()).not.toContain(lA)
    expect(app.hubRealtime.total()).toBe(0)
  })

  it('SEC-101: excedente por usuario recebe 429 e a vaga volta ao fechar', async () => {
    const { uA } = await duasLojas()
    await montar({ limitePorUsuario: 2 })
    const c1 = await cli(uA)
    await cli(uA)
    const c3 = await cli(uA)
    expect(c3.status).toBe(429)
    expect(c3.headers.get('retry-after')).toBe('5')
    c1.fechar()
    for (let i = 0; i < 50 && app.hubRealtime.total() > 1; i++) await dormir(20)
    expect((await cli(uA)).status).toBe(200)
  })

  it('SEC-040: token que expira durante a conexao encerra o stream com fim', async () => {
    const { uA } = await duasLojas()
    await montar()
    const c = await cli(uA, {}, 2)
    await c.esperar('retry:')
    await c.esperar('event: fim', 5000)
    expect(c.texto()).toContain('token_expirado')
    await dormir(100)
    expect(c.terminou()).toBe(true)
    expect(app.hubRealtime.total()).toBe(0)
  })

  it('heartbeat periodico (comentario SSE)', async () => {
    const { uA } = await duasLojas()
    await montar({ heartbeatMs: 100 })
    const c = await cli(uA)
    await c.esperar(': hb')
  })

  it('Last-Event-ID retoma eventos perdidos; id velho vira resync', async () => {
    const { uA, lA } = await duasLojas()
    await montar()
    const c1 = await cli(uA)
    await c1.esperar('retry:')
    await dormir(300)
    await notificar(poolApi, { tipo: 'pedido.atualizado', loja_id: lA, payload: pedido(lA) })
    await c1.esperar('id: ')
    const id1 = /id: (\S+)/.exec(c1.texto())![1]!
    c1.fechar()
    await notificar(poolApi, { tipo: 'pedido.atualizado', loja_id: lA, payload: pedido(lA, 'em_preparo') })
    for (let i = 0; i < 100 && app.hubRealtime.total() > 0; i++) await dormir(20)
    await dormir(200)
    const c2 = await cli(uA, { 'last-event-id': id1 })
    await c2.esperar('em_preparo')
    expect(c2.texto()).not.toContain('resync')
    const c3 = await cli(uA, { 'last-event-id': 'lixo-1' })
    await c3.esperar('event: resync')
    expect(c3.texto()).toContain('id_antigo')
  })

  it('derrubar a conexao LISTEN: reconecta, envia resync e volta a entregar', async () => {
    const { uA, lA } = await duasLojas()
    await montar()
    const c = await cli(uA)
    await c.esperar('retry:')
    for (let i = 0; i < 100 && !app.escutaRealtime()?.conectada(); i++) await dormir(20)
    expect(app.escutaRealtime()?.conectada()).toBe(true)
    await poolSuper.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'whaviso_listen' and pid <> pg_backend_pid()",
    )
    await c.esperar('event: resync', 8000)
    expect(c.texto()).toContain('reconectou')
    await notificar(poolApi, { tipo: 'conversa.mensagem', loja_id: lA, payload: { conversa_id: randomUUID(), loja_id: lA, direcao: 'entrada', autor: 'cliente' } })
    await c.esperar('event: conversa.mensagem')
  })

  it('carga leve: 200 conexoes usam 1 conexao LISTEN e limpam ao fechar', async () => {
    const { uA, lA } = await duasLojas()
    await montar({ limitePorUsuario: 1000, limitePorLoja: 1000 })
    const clientes: Cliente[] = []
    for (let i = 0; i < 200; i++) clientes.push(await cli(uA))
    for (const c of clientes) await c.esperar('retry:')
    expect(app.hubRealtime.total()).toBe(200)
    const { rows } = await poolSuper.query<{ n: string }>(
      "select count(*)::text as n from pg_stat_activity where application_name = 'whaviso_listen'",
    )
    expect(Number(rows[0]!.n)).toBe(1)
    await dormir(300)
    const antes = process.memoryUsage().heapUsed
    for (let i = 0; i < 20; i++) {
      await notificar(poolApi, { tipo: 'pedido.atualizado', loja_id: lA, payload: pedido(lA) })
    }
    await clientes[199]!.esperar('event: pedido.atualizado')
    global.gc?.()
    expect(process.memoryUsage().heapUsed - antes).toBeLessThan(60 * 1024 * 1024)
    for (const c of clientes) c.fechar()
    for (let i = 0; i < 200 && app.hubRealtime.total() > 0; i++) await dormir(20)
    expect(app.hubRealtime.total()).toBe(0)
  }, 60_000)

  it('graceful shutdown envia fim', async () => {
    const { uA } = await duasLojas()
    await montar()
    const c = await cli(uA)
    await c.esperar('retry:')
    await app.close()
    await c.esperar('event: fim')
    expect(c.texto()).toContain('encerrando')
  })
})
