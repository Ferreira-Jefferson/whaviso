import { describe, expect, it } from 'vitest'
import { contratoClienteCanal } from './contratos/canais'
import { CredencialResolvida } from './erros'
import { criarCanalIfood, criarCanalIfoodDoAmbiente } from './canais_ifood'

// Suite deterministica: nenhum teste toca a rede (fetchImpl e resolverDns injetados) nem dispara
// timer real (agendar no-op). Cobre OAuth + cache, polling -> detalhe -> mapeamento com totais
// reconciliados, descarte de payload invalido, acknowledgment, mapeamento de erro e o gating.

const BASE = {
  clientId: 'cli-id',
  clientSecret: 'cli-SENTINELA-SECRET',
  resolverDns: async () => ['93.184.216.34'],
  agendar: () => () => {},
} as const

const CRED = new CredencialResolvida('merchant-uuid-0123456789')

const resp = (body: unknown, status = 200): Response =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

interface Chamada {
  metodo: string
  pathname: string
  auth: string | undefined
  merchant: string | undefined
  body: string | undefined
}

function gravador(rotear: (c: Chamada, url: URL) => Response) {
  const chamadas: Chamada[] = []
  const fetchImpl = ((input: string | URL, init?: RequestInit) => {
    const url = new URL(input instanceof URL ? input.href : String(input))
    const headers = new Headers(init?.headers)
    const c: Chamada = {
      metodo: init?.method ?? 'GET',
      pathname: url.pathname,
      auth: headers.get('authorization') ?? undefined,
      merchant: headers.get('x-polling-merchants') ?? undefined,
      body: typeof init?.body === 'string' ? init.body : undefined,
    }
    chamadas.push(c)
    return Promise.resolve(rotear(c, url))
  }) as unknown as typeof fetch
  return { chamadas, fetchImpl }
}

const TOKEN = (c: Chamada) => c.pathname === '/authentication/v1.0/oauth/token'
const POLL = (c: Chamada) => c.pathname === '/events/v1.0/events:polling'
const ACK = (c: Chamada) => c.pathname === '/events/v1.0/events/acknowledgment'
const ORDER = (c: Chamada) => c.pathname.startsWith('/order/v1.0/orders/')

const PEDIDO_OK = {
  id: 'ord1',
  createdAt: '2026-10-27T12:00:00Z',
  orderType: 'DELIVERY',
  items: [{ name: 'Pizza', quantity: 2, unitPrice: 35.0, observations: 'sem cebola' }],
  total: { deliveryFee: 5.0, subTotal: 70.0, orderAmount: 75.0 },
}

/** Rota feliz: token, 1 evento PLC + 1 evento ignorado, detalhe do pedido, ack. */
function rotaFeliz(c: Chamada): Response {
  if (TOKEN(c)) return resp({ accessToken: 'tok-1', expiresIn: 3600 })
  if (POLL(c)) {
    return resp([
      { id: 'ev1', code: 'PLC', orderId: 'ord1' },
      { id: 'ev2', code: 'KEEPALIVE' },
    ])
  }
  if (ORDER(c)) return resp(PEDIDO_OK)
  if (ACK(c)) return resp(null, 202)
  return resp({ erro: 'rota inesperada' }, 404)
}

contratoClienteCanal('ifood (mock)', () => criarCanalIfood({ ...BASE, fetchImpl: gravador(rotaFeliz).fetchImpl }))

describe('canais_ifood: buscarPedidos', () => {
  it('mapeia pedido PLC com totais reconciliados e modalidade; escopa o polling pelo merchant', async () => {
    const g = gravador(rotaFeliz)
    const cliente = criarCanalIfood({ ...BASE, fetchImpl: g.fetchImpl })
    const r = await cliente.buscarPedidos(CRED, {})
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor).toHaveLength(1)
      expect(r.valor[0]).toMatchObject({
        id_externo: 'ord1',
        modalidade: 'entrega',
        subtotal_centavos: 7000,
        taxa_entrega_centavos: 500,
        total_centavos: 7500,
      })
      expect(r.valor[0]!.itens[0]).toMatchObject({ nome: 'Pizza', quantidade: 2, preco_unitario_centavos: 3500, observacao: 'sem cebola' })
    }
    expect(g.chamadas.find(POLL)?.merchant).toBe('merchant-uuid-0123456789')
    // O evento ignorado (KEEPALIVE) e confirmado no polling para nao reentregar.
    const ack = g.chamadas.find(ACK)
    expect(ack?.body).toContain('ev2')
    expect(ack?.body).not.toContain('ev1')
  })

  it('descarta pedido nao reconciliavel (sem itens) sem derrubar o lote', async () => {
    const g = gravador((c) => {
      if (POLL(c)) return resp([{ id: 'evX', code: 'PLC', orderId: 'ordX' }])
      if (ORDER(c)) return resp({ id: 'ordX', createdAt: '2026-10-27T12:00:00Z', orderType: 'DELIVERY', items: [] })
      return rotaFeliz(c)
    })
    const r = await criarCanalIfood({ ...BASE, fetchImpl: g.fetchImpl }).buscarPedidos(CRED, {})
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toHaveLength(0)
  })

  it('reaproveita o token entre chamadas (nao reautentica)', async () => {
    const g = gravador(rotaFeliz)
    const cliente = criarCanalIfood({ ...BASE, fetchImpl: g.fetchImpl })
    await cliente.buscarPedidos(CRED, {})
    await cliente.buscarPedidos(CRED, {})
    expect(g.chamadas.filter(TOKEN)).toHaveLength(1)
  })

  it('polling 204 devolve lista vazia', async () => {
    const g = gravador((c) => (TOKEN(c) ? resp({ accessToken: 't', expiresIn: 3600 }) : POLL(c) ? resp(null, 204) : rotaFeliz(c)))
    const r = await criarCanalIfood({ ...BASE, fetchImpl: g.fetchImpl }).buscarPedidos(CRED, {})
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toHaveLength(0)
  })

  it('polling 500 vira falha transitoria; token 401 vira falha permanente de credencial', async () => {
    const g5 = gravador((c) => (TOKEN(c) ? resp({ accessToken: 't', expiresIn: 3600 }) : resp({ erro: 'x' }, 500)))
    const r5 = await criarCanalIfood({ ...BASE, fetchImpl: g5.fetchImpl }).buscarPedidos(CRED, {})
    expect(r5.ok).toBe(false)
    if (!r5.ok) expect(r5.erro.retentavel).toBe(true)

    const g401 = gravador(() => resp({ erro: 'nao autorizado' }, 401))
    const r401 = await criarCanalIfood({ ...BASE, fetchImpl: g401.fetchImpl }).buscarPedidos(CRED, {})
    expect(r401.ok).toBe(false)
    if (!r401.ok) expect(r401.erro.codigo).toBe('credencial')
  })

  it('a credencial de app nunca aparece no corpo das requisicoes alem do token', async () => {
    const g = gravador(rotaFeliz)
    await criarCanalIfood({ ...BASE, fetchImpl: g.fetchImpl }).buscarPedidos(CRED, {})
    for (const c of g.chamadas) {
      if (TOKEN(c)) continue // so o token carrega o clientSecret, por design do OAuth
      expect(c.body ?? '').not.toContain('cli-SENTINELA-SECRET')
    }
  })
})

describe('canais_ifood: confirmar', () => {
  it('da ack dos eventos do pedido importado e e idempotente', async () => {
    const g = gravador(rotaFeliz)
    const cliente = criarCanalIfood({ ...BASE, fetchImpl: g.fetchImpl })
    await cliente.buscarPedidos(CRED, {})
    const antes = g.chamadas.filter(ACK).length
    const r = await cliente.confirmar(CRED, 'ord1')
    expect(r.ok).toBe(true)
    const ackPedido = g.chamadas.filter(ACK).at(-1)
    expect(ackPedido?.body).toContain('ev1')
    expect(g.chamadas.filter(ACK).length).toBe(antes + 1)
    // Segundo confirmar: nada a confirmar (ja removido), sem nova chamada.
    const r2 = await cliente.confirmar(CRED, 'ord1')
    expect(r2.ok).toBe(true)
    expect(g.chamadas.filter(ACK).length).toBe(antes + 1)
  })

  it('confirmar id desconhecido devolve ok sem chamada', async () => {
    const g = gravador(rotaFeliz)
    const r = await criarCanalIfood({ ...BASE, fetchImpl: g.fetchImpl }).confirmar(CRED, 'inexistente')
    expect(r.ok).toBe(true)
    expect(g.chamadas).toHaveLength(0)
  })
})

describe('canais_ifood: gating por credencial', () => {
  it('sem clientId/clientSecret no ambiente, devolve null (cai no stub)', () => {
    expect(criarCanalIfoodDoAmbiente({})).toBeNull()
    expect(criarCanalIfoodDoAmbiente({ API_CANAL_IFOOD_CLIENT_ID: 'x' })).toBeNull()
  })
  it('com o par de credenciais, devolve o cliente real', () => {
    expect(
      criarCanalIfoodDoAmbiente({ API_CANAL_IFOOD_CLIENT_ID: 'x', API_CANAL_IFOOD_CLIENT_SECRET: 'y' }),
    ).not.toBeNull()
  })
})
