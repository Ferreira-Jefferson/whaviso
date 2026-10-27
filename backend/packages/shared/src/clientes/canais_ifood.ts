import { z } from 'zod'
import {
  falha,
  ok,
  CredencialResolvida,
  ErroProvedor,
  Permanente,
  RateLimit,
  Transitorio,
  type HostPermitido,
  type Resultado,
} from './erros'
import { fetchSeguro, type ResolverDns } from './fetch_seguro'
import { comTimeout, Disjuntor, type Agendar, type Relogio } from './resiliencia'
import type { BuscarPedidosEntrada, ClienteCanal } from './canais'
import { PedidoExterno } from '../contracts/canais'

// Implementacao real de ClienteCanal sobre a API oficial de parceiro do iFood (Merchant/Order).
//
// POR QUE O iFOOD (default): e o canal pedido explicitamente pela especificacao (G4) e o de maior
// adocao; a interface `ClienteCanal` ja foi desenhada para marketplaces (iFood e afins). Outros
// canais entram pela MESMA interface, em sequencia, sem mudar o modulo canais.
//
// MODELO DE CREDENCIAL (importante): o iFood usa OAuth client_credentials no NIVEL DA APLICACAO
// integradora (o whaviso). Esse par clientId/clientSecret e SEGREDO e vem do AMBIENTE (nao e por
// loja). O identificador POR LOJA e o `merchantId` do iFood, que chega por chamada dentro de
// `CredencialResolvida` (write-only na borda, cifrado no banco, nunca em log): e ele que escopa o
// polling de eventos daquela loja.
//
// FLUXO: (1) token de app por client_credentials (cacheado ate expirar); (2) polling de eventos do
// merchant; (3) eventos de pedido colocado (PLC) viram `PedidoExterno` buscando o detalhe do pedido;
// (4) `confirmar` da o acknowledgment dos eventos daquele pedido (idempotente, evita reentrega).
// Toda saida HTTP passa por `fetchSeguro` (SSRF/allowlist, so HTTPS). A saida do iFood e NAO
// confiavel: cada pedido e revalidado por `PedidoExterno` (Zod estrito) antes de sair daqui.
//
// LIMITE HONESTO (go-live): sem uma conta de parceiro iFood homologada (clientId/clientSecret reais
// e o merchant autorizado) nao ha como validar ponta a ponta. Aqui a mecanica esta correta por
// construcao (OAuth, polling, mapeamento, acknowledgment, SSRF) e coberta por testes com HTTP mockado.

const BASE_IFOOD = 'https://merchant-api.ifood.com.br'
const MAX_MAPA_EVENTOS = 5_000

export interface ConfigCanalIfood {
  /** clientId da aplicacao integradora (nivel app, segredo). */
  clientId: string
  /** clientSecret da aplicacao integradora (nivel app, segredo). */
  clientSecret: string
  /** Base HTTPS da API (default: https://merchant-api.ifood.com.br). */
  baseUrl?: string
  timeoutMs?: number
  disjuntorLimiar?: number
  disjuntorReabrirMs?: number
  /** Codigos de evento tratados como pedido novo (default: PLC). */
  codigosPedido?: readonly string[]
  /** Injecoes para teste (nunca rede real na suite). */
  fetchImpl?: typeof fetch
  resolverDns?: ResolverDns
  relogio?: Relogio
  agendar?: Agendar
}

const PADRAO = {
  baseUrl: BASE_IFOOD,
  timeoutMs: 10_000,
  disjuntorLimiar: 5,
  disjuntorReabrirMs: 30_000,
  codigosPedido: ['PLC'] as const,
} as const

const semBarra = (u: string) => u.replace(/\/+$/, '')
const hostDe = (u: string) => new URL(u).hostname
const centavos = (reais: number) => Math.round(reais * 100)

const TokenIfood = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().optional(),
  tokenType: z.string().optional(),
})

const EventoIfood = z.object({
  id: z.string().min(1),
  code: z.string().optional(),
  orderId: z.string().optional(),
  createdAt: z.string().optional(),
})
const EventosIfood = z.array(EventoIfood)

const ItemIfood = z.object({
  name: z.string().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  price: z.number().optional(),
  observations: z.string().optional(),
})

const PedidoIfood = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  orderType: z.string().optional(),
  items: z.array(ItemIfood).optional(),
  total: z
    .object({
      subTotal: z.number().optional(),
      deliveryFee: z.number().optional(),
      orderAmount: z.number().optional(),
    })
    .optional(),
})

function erroHttp(status: number): ErroProvedor {
  if (status === 429) return new RateLimit('limite de taxa do canal', undefined, { codigo: 'http_429' })
  if (status >= 500) return new Transitorio('canal indisponivel', { codigo: `http_${status}` })
  if (status === 401 || status === 403) return new Permanente('credencial recusada pelo canal', { codigo: 'credencial' })
  return new Permanente('canal rejeitou a requisicao', { codigo: `http_${status}` })
}

function erroTransporte(e: unknown): ErroProvedor {
  if (e instanceof ErroProvedor) return e
  if (e instanceof Error && e.name === 'AbortError') return new Transitorio('tempo esgotado', { codigo: 'timeout' })
  return new Transitorio('falha de rede com o canal', { codigo: 'rede' })
}

class ClienteCanalIfood implements ClienteCanal {
  readonly #base: string
  readonly #host: HostPermitido
  readonly #clientId: string
  readonly #clientSecret: string
  readonly #timeoutMs: number
  readonly #codigosPedido: ReadonlySet<string>
  readonly #fetchImpl?: typeof fetch
  readonly #resolverDns?: ResolverDns
  readonly #agendar?: Agendar
  readonly #relogio: Relogio
  readonly #disjuntor: Disjuntor
  /** orderId -> eventIds vistos no polling, para o acknowledgment em `confirmar`. Bounded. */
  readonly #eventosPorPedido = new Map<string, string[]>()
  #token: { valor: string; expiraEm: number } | null = null

  constructor(cfg: ConfigCanalIfood) {
    if (!cfg.clientId.trim() || !cfg.clientSecret.trim()) throw new Error('canais_ifood: clientId e clientSecret obrigatorios')
    this.#base = semBarra(cfg.baseUrl ?? PADRAO.baseUrl)
    this.#host = hostDe(this.#base)
    this.#clientId = cfg.clientId.trim()
    this.#clientSecret = cfg.clientSecret.trim()
    this.#timeoutMs = cfg.timeoutMs ?? PADRAO.timeoutMs
    this.#codigosPedido = new Set((cfg.codigosPedido ?? PADRAO.codigosPedido).map((c) => c.toUpperCase()))
    this.#fetchImpl = cfg.fetchImpl
    this.#resolverDns = cfg.resolverDns
    this.#agendar = cfg.agendar
    this.#relogio = cfg.relogio ?? Date.now
    this.#disjuntor = new Disjuntor({
      limiar: cfg.disjuntorLimiar ?? PADRAO.disjuntorLimiar,
      reabrirAposMs: cfg.disjuntorReabrirMs ?? PADRAO.disjuntorReabrirMs,
      relogio: cfg.relogio,
    })
  }

  async #req(
    metodo: 'GET' | 'POST',
    caminho: string,
    op: { auth?: string; headers?: Record<string, string>; bodyJson?: unknown; bodyForm?: Record<string, string> },
  ): Promise<Resultado<{ http: number; corpo: unknown }, ErroProvedor>> {
    return this.#disjuntor.executar(() =>
      comTimeout(
        async (sinal) => {
          const headers: Record<string, string> = { accept: 'application/json', ...(op.headers ?? {}) }
          if (op.auth) headers.authorization = op.auth
          let body: string | undefined
          if (op.bodyForm) {
            headers['content-type'] = 'application/x-www-form-urlencoded'
            body = new URLSearchParams(op.bodyForm).toString()
          } else if (op.bodyJson !== undefined) {
            headers['content-type'] = 'application/json'
            body = JSON.stringify(op.bodyJson)
          }
          let resp: Response
          try {
            resp = await fetchSeguro(this.#base + caminho, {
              hostsPermitidos: [this.#host],
              init: { method: metodo, headers, body, signal: sinal },
              fetchImpl: this.#fetchImpl,
              resolverDns: this.#resolverDns,
            })
          } catch (e) {
            return falha(erroTransporte(e))
          }
          if (resp.status === 429 || resp.status >= 500 || resp.status === 401 || resp.status === 403) {
            return falha(erroHttp(resp.status))
          }
          if (resp.status === 204) return ok({ http: 204, corpo: null })
          let corpo: unknown = null
          try {
            corpo = await resp.json()
          } catch {
            corpo = null
          }
          return ok({ http: resp.status, corpo })
        },
        this.#timeoutMs,
        this.#agendar,
      ),
    )
  }

  async #garantirToken(): Promise<Resultado<string, ErroProvedor>> {
    const agora = this.#relogio()
    if (this.#token && this.#token.expiraEm > agora + 30_000) return ok(this.#token.valor)
    const r = await this.#req('POST', '/authentication/v1.0/oauth/token', {
      bodyForm: { grantType: 'client_credentials', clientId: this.#clientId, clientSecret: this.#clientSecret },
    })
    if (!r.ok) return r
    if (r.valor.http >= 400) return falha(erroHttp(r.valor.http))
    const parsed = TokenIfood.safeParse(r.valor.corpo)
    if (!parsed.success) return falha(new Transitorio('token do canal em formato inesperado', { codigo: 'formato' }))
    const expiraEm = agora + (parsed.data.expiresIn ?? 300) * 1_000
    this.#token = { valor: parsed.data.accessToken, expiraEm }
    return ok(parsed.data.accessToken)
  }

  #lembrarEvento(orderId: string, eventId: string): void {
    const lista = this.#eventosPorPedido.get(orderId)
    if (lista) {
      if (!lista.includes(eventId)) lista.push(eventId)
      return
    }
    if (this.#eventosPorPedido.size >= MAX_MAPA_EVENTOS) {
      const maisAntigo = this.#eventosPorPedido.keys().next().value
      if (maisAntigo !== undefined) this.#eventosPorPedido.delete(maisAntigo)
    }
    this.#eventosPorPedido.set(orderId, [eventId])
  }

  async #acknowledgment(auth: string, eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return
    await this.#req('POST', '/events/v1.0/events/acknowledgment', {
      auth,
      bodyJson: eventIds.map((id) => ({ id })),
    })
  }

  /** Mapeia o detalhe de um pedido do iFood para o formato canonico. `null` se nao reconciliavel. */
  #mapear(idExterno: string, detalhe: unknown): PedidoExterno | null {
    const parsed = PedidoIfood.safeParse(detalhe)
    if (!parsed.success) return null
    const d = parsed.data
    const itens = (d.items ?? []).map((i) => ({
      nome: (i.name ?? 'Item').trim().slice(0, 200),
      quantidade: Math.round(i.quantity ?? 1),
      preco_unitario_centavos: centavos(i.unitPrice ?? i.price ?? 0),
      ...(i.observations?.trim() ? { observacao: i.observations.trim().slice(0, 300) } : {}),
    }))
    const subtotal = itens.reduce((s, i) => s + i.preco_unitario_centavos * i.quantidade, 0)
    const taxa = centavos(d.total?.deliveryFee ?? 0)
    const candidato = {
      id_externo: idExterno,
      criado_em: d.createdAt ?? new Date().toISOString(),
      modalidade: (d.orderType ?? '').toUpperCase() === 'DELIVERY' ? 'entrega' : 'retirada',
      itens,
      subtotal_centavos: subtotal,
      taxa_entrega_centavos: taxa,
      total_centavos: subtotal + taxa,
    }
    const v = PedidoExterno.safeParse(candidato)
    return v.success ? v.data : null
  }

  async buscarPedidos(
    _cred: CredencialResolvida,
    _entrada: BuscarPedidosEntrada,
  ): Promise<Resultado<PedidoExterno[], ErroProvedor>> {
    const tok = await this.#garantirToken()
    if (!tok.ok) return tok
    const auth = `Bearer ${tok.valor}`
    const merchantId = _cred.revelar()

    const ev = await this.#req('GET', '/events/v1.0/events:polling', {
      auth,
      headers: { 'x-polling-merchants': merchantId },
    })
    if (!ev.ok) return ev
    if (ev.valor.http === 204 || ev.valor.corpo == null) return ok([])
    if (ev.valor.http >= 400) return falha(erroHttp(ev.valor.http))
    const eventos = EventosIfood.safeParse(ev.valor.corpo)
    if (!eventos.success) return falha(new Transitorio('eventos do canal em formato inesperado', { codigo: 'formato' }))

    const pedidos: PedidoExterno[] = []
    const ignorados: string[] = []
    for (const e of eventos.data) {
      const ePedido = this.#codigosPedido.has((e.code ?? '').toUpperCase())
      if (!ePedido || !e.orderId) {
        ignorados.push(e.id)
        continue
      }
      const det = await this.#req('GET', `/order/v1.0/orders/${encodeURIComponent(e.orderId)}`, { auth })
      if (!det.ok) return det
      if (det.valor.http >= 400) return falha(erroHttp(det.valor.http))
      const pedido = this.#mapear(e.orderId, det.valor.corpo)
      if (!pedido) {
        // Pedido nao reconciliavel: confirma o evento para nao reentregar lixo e segue.
        ignorados.push(e.id)
        continue
      }
      this.#lembrarEvento(e.orderId, e.id)
      pedidos.push(pedido)
    }
    // Eventos que nao viram pedido sao confirmados agora (nao ha quem os confirme depois).
    await this.#acknowledgment(auth, ignorados)
    return ok(pedidos)
  }

  async confirmar(_cred: CredencialResolvida, idExterno: string): Promise<Resultado<void, ErroProvedor>> {
    const eventIds = this.#eventosPorPedido.get(idExterno)
    if (!eventIds || eventIds.length === 0) return ok(undefined)
    const tok = await this.#garantirToken()
    if (!tok.ok) return tok
    const r = await this.#req('POST', '/events/v1.0/events/acknowledgment', {
      auth: `Bearer ${tok.valor}`,
      bodyJson: eventIds.map((id) => ({ id })),
    })
    if (!r.ok) return r
    if (r.valor.http >= 400) return falha(erroHttp(r.valor.http))
    this.#eventosPorPedido.delete(idExterno)
    return ok(undefined)
  }
}

export function criarCanalIfood(cfg: ConfigCanalIfood): ClienteCanal {
  return new ClienteCanalIfood(cfg)
}

/**
 * Monta o ClienteCanal real do iFood a partir do ambiente (convencao API_*). Gating por CREDENCIAL:
 * sem o par clientId/clientSecret da aplicacao integradora, devolve `null` e o modulo canais cai no
 * `StubClienteCanal` (501 `canal_nao_integrado`). Vars:
 *   API_CANAL_IFOOD_CLIENT_ID      clientId da aplicacao integradora (segredo)
 *   API_CANAL_IFOOD_CLIENT_SECRET  clientSecret da aplicacao integradora (segredo)
 *   API_CANAL_IFOOD_BASE_URL       opcional: base HTTPS da API
 *   API_CANAL_IFOOD_TIMEOUT_MS     opcional: teto por chamada (default 10000)
 */
export function criarCanalIfoodDoAmbiente(env: Record<string, string | undefined> = process.env): ClienteCanal | null {
  const clientId = env.API_CANAL_IFOOD_CLIENT_ID?.trim()
  const clientSecret = env.API_CANAL_IFOOD_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  const inteiro = (v: string | undefined) => {
    const n = v?.trim() ? Number(v.trim()) : NaN
    return Number.isInteger(n) && n > 0 ? n : undefined
  }
  return criarCanalIfood({
    clientId,
    clientSecret,
    baseUrl: env.API_CANAL_IFOOD_BASE_URL?.trim() || undefined,
    timeoutMs: inteiro(env.API_CANAL_IFOOD_TIMEOUT_MS),
  })
}
