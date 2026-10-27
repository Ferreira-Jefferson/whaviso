import { describe, expect, it, vi } from 'vitest'
import { ParserSse, type MensagemSse } from './sse'
import { ClienteRealtime, type EventoRealtime } from './cliente'

const LOJA = '11111111-1111-4111-8111-111111111111'
const PEDIDO = '22222222-2222-4222-8222-222222222222'
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('ParserSse', () => {
  it('despacha eventos, entende comentarios e CRLF, ignora trechos parciais', () => {
    const msgs: MensagemSse[] = []
    let hb = 0
    const p = new ParserSse((m) => msgs.push(m), () => hb++)
    p.alimentar(': ping\r\n')
    p.alimentar('id: 7\nevent: pedido.atua')
    p.alimentar('lizado\ndata: {"a":1}\n')
    expect(msgs).toHaveLength(0)
    p.alimentar('\n')
    p.alimentar('data: x\ndata: y\n\n')
    expect(hb).toBe(1)
    expect(msgs[0]).toEqual({ id: '7', evento: 'pedido.atualizado', data: '{"a":1}' })
    expect(msgs[1]).toEqual({ id: null, evento: 'message', data: 'x\ny' })
    expect(p.ultimoIdVisto).toBe('7')
  })
})

/** Servidor SSE fake: cada chamada de fetch devolve um stream que o teste controla. */
function servidorFake() {
  const conexoes: Array<{
    headers: Record<string, string>
    escrever: (t: string) => void
    fechar: () => void
  }> = []
  const respostas: Array<Response | 'normal'> = []
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const pronta = respostas.shift()
    if (pronta && pronta !== 'normal') return pronta
    let ctrl!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c
      },
    })
    init.signal?.addEventListener('abort', () => {
      try {
        ctrl.error(new DOMException('abort', 'AbortError'))
      } catch {
        // ja fechado
      }
    })
    const enc = new TextEncoder()
    conexoes.push({
      headers: init.headers as Record<string, string>,
      escrever: (t) => ctrl.enqueue(enc.encode(t)),
      fechar: () => ctrl.close(),
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })
  return { conexoes, respostas, fetchImpl: fetchImpl as unknown as typeof fetch, chamadas: fetchImpl }
}

function criar(srv: ReturnType<typeof servidorFake>, extra: Partial<ConstructorParameters<typeof ClienteRealtime>[0]> = {}) {
  const eventos: EventoRealtime[] = []
  const estados: string[] = []
  const aoResync = vi.fn()
  const aoSessaoExpirada = vi.fn()
  const c = new ClienteRealtime({
    url: 'http://api.test/realtime/stream',
    lojaId: LOJA,
    getToken: async () => 'tok',
    renovarToken: async () => null,
    aoEvento: (e) => eventos.push(e),
    aoEstado: (e) => estados.push(e),
    aoResync,
    aoSessaoExpirada,
    fetchImpl: srv.fetchImpl,
    backoffBaseMs: 5,
    backoffMaxMs: 20,
    aleatorio: () => 0,
    ...extra,
  })
  return { c, eventos, estados, aoResync, aoSessaoExpirada }
}

describe('ClienteRealtime', () => {
  it('conecta com Bearer e x-loja-id (nunca JWT na URL) e entrega eventos validados', async () => {
    const srv = servidorFake()
    const { c, eventos, estados } = criar(srv)
    c.iniciar()
    await pausa(15)
    expect(srv.chamadas.mock.calls[0]?.[0]).toBe('http://api.test/realtime/stream')
    expect(srv.conexoes[0]?.headers.Authorization).toBe('Bearer tok')
    expect(srv.conexoes[0]?.headers['x-loja-id']).toBe(LOJA)
    expect(estados).toContain('ao_vivo')
    const payload = JSON.stringify({ pedido_id: PEDIDO, loja_id: LOJA, status: 'novo' })
    srv.conexoes[0]?.escrever(`id: 1\nevent: pedido.atualizado\ndata: ${payload}\n\n`)
    await pausa(15)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ tipo: 'pedido.atualizado', id: '1' })
    c.parar()
  })

  it('descarta payload fora do contrato (ex.: com PII) e evento desconhecido', async () => {
    const srv = servidorFake()
    const { c, eventos } = criar(srv)
    c.iniciar()
    await pausa(15)
    const comPii = JSON.stringify({ pedido_id: PEDIDO, loja_id: LOJA, status: 'novo', telefone: '+5511999999999' })
    srv.conexoes[0]?.escrever(`event: pedido.atualizado\ndata: ${comPii}\n\n`)
    srv.conexoes[0]?.escrever('event: outro\ndata: {}\n\n')
    srv.conexoes[0]?.escrever('event: pedido.atualizado\ndata: nao-json\n\n')
    await pausa(15)
    expect(eventos).toHaveLength(0)
    c.parar()
  })

  it('evento resync dispara aoResync', async () => {
    const srv = servidorFake()
    const { c, aoResync } = criar(srv)
    c.iniciar()
    await pausa(15)
    srv.conexoes[0]?.escrever('event: resync\ndata: {}\n\n')
    await pausa(15)
    expect(aoResync).toHaveBeenCalledTimes(1)
    c.parar()
  })

  it('queda do stream: reconecta com Last-Event-ID e sinaliza resync', async () => {
    const srv = servidorFake()
    const { c, aoResync } = criar(srv)
    c.iniciar()
    await pausa(15)
    srv.conexoes[0]?.escrever('id: 42\nevent: conversa.handoff\ndata: {}\n\n')
    await pausa(10)
    srv.conexoes[0]?.fechar()
    await pausa(60)
    expect(srv.conexoes.length).toBeGreaterThanOrEqual(2)
    expect(srv.conexoes[1]?.headers['Last-Event-ID']).toBe('42')
    expect(aoResync).toHaveBeenCalledTimes(1)
    c.parar()
  })

  it('erro HTTP: tenta de novo com backoff', async () => {
    const srv = servidorFake()
    srv.respostas.push(new Response('x', { status: 503 }), 'normal')
    const { c, estados } = criar(srv)
    c.iniciar()
    await pausa(80)
    expect(srv.chamadas.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(estados).toContain('reconectando')
    expect(estados.at(-1)).toBe('ao_vivo')
    c.parar()
  })

  it('watchdog: sem bytes nem heartbeat reconecta', async () => {
    const srv = servidorFake()
    const { c } = criar(srv, { watchdogMs: 30 })
    c.iniciar()
    await pausa(120)
    expect(srv.conexoes.length).toBeGreaterThanOrEqual(2)
    c.parar()
  })

  it('heartbeat (comentario) mantem a conexao viva', async () => {
    const srv = servidorFake()
    const { c } = criar(srv, { watchdogMs: 40 })
    c.iniciar()
    await pausa(10)
    for (let i = 0; i < 5; i++) {
      srv.conexoes[0]?.escrever(': ping\n')
      await pausa(20)
    }
    expect(srv.conexoes).toHaveLength(1)
    c.parar()
  })

  it('SEC-040: 401 sem renovacao encerra e avisa a sessao expirada', async () => {
    const srv = servidorFake()
    srv.respostas.push(new Response('x', { status: 401 }))
    const { c, aoSessaoExpirada, estados } = criar(srv)
    c.iniciar()
    await pausa(30)
    expect(aoSessaoExpirada).toHaveBeenCalledTimes(1)
    expect(estados.at(-1)).toBe('desligado')
    expect(srv.chamadas).toHaveBeenCalledTimes(1)
  })

  it('parar() nao reconecta', async () => {
    const srv = servidorFake()
    const { c } = criar(srv)
    c.iniciar()
    await pausa(15)
    c.parar()
    await pausa(60)
    expect(srv.chamadas).toHaveBeenCalledTimes(1)
  })
})
