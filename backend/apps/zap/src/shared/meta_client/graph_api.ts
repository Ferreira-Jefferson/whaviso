// Cliente HTTP fino sobre fetchSeguro (SEC-070): host na allowlist, so HTTPS, sem IP
// literal, redirect revalidado salto a salto, timeout. O token vai SEMPRE no header
// Authorization (nunca na URL, nunca no corpo, nunca em log).
import { fetchSeguro, type HostPermitido, type ResolverDns } from '@whaviso/shared/clientes'

export interface ContextoGraph {
  /** Base do Graph; default graph.facebook.com. */
  host: string
  /** Versao da Graph API (ex.: v23.0). */
  apiVersion: string
  timeoutMs: number
  /** Injecao para testes (sem rede real). */
  fetchImpl?: typeof fetch
  resolverDns?: ResolverDns
}

/** URL absoluta de um caminho relativo da Graph API (ex.: `100200300/messages`). */
export function urlGraph(ctx: ContextoGraph, caminho: string): string {
  return `https://${ctx.host}/${ctx.apiVersion}/${caminho}`
}

export interface OpcoesRequisicao {
  url: string
  token: string
  metodo: 'GET' | 'POST'
  body?: unknown
  /** Allowlist de host desta chamada (Graph por padrao; CDN de midia no download). */
  hostsPermitidos: readonly HostPermitido[]
}

/**
 * Executa a requisicao e devolve a Response crua (pode ser 4xx/5xx; quem chama interpreta).
 * Lanca ErroProvedor (ErroSsrf/Transitorio) de fetchSeguro, ou a excecao de rede/timeout.
 */
export function requisicaoGraph(ctx: ContextoGraph, op: OpcoesRequisicao): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${op.token}` }
  const init: RequestInit = { method: op.metodo, headers }
  if (op.metodo === 'POST') {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(op.body ?? {})
  }
  return fetchSeguro(op.url, {
    hostsPermitidos: op.hostsPermitidos,
    init,
    timeoutMs: ctx.timeoutMs,
    fetchImpl: ctx.fetchImpl,
    resolverDns: ctx.resolverDns,
  })
}

/** Retry-After (segundos) do header 429 em ms, se presente e numerico. */
export function retryAposMs(resp: Response): number | undefined {
  const bruto = resp.headers.get('retry-after')
  if (!bruto) return undefined
  const segundos = Number(bruto)
  return Number.isFinite(segundos) && segundos >= 0 ? Math.round(segundos * 1000) : undefined
}
