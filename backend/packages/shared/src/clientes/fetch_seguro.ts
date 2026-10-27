import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ErroSsrf, hostPermitido, Transitorio, type HostPermitido } from './erros'

// fetchSeguro: unico caminho HTTP de saida das implementacoes de provedor (SEC-070).
// - so HTTPS; host (e cada host de redirect) precisa estar na allowlist do cliente;
// - nunca conecta em loopback, link-local (169.254.*), redes privadas, CGNAT, multicast;
// - redirect seguido MANUALMENTE, revalidando cada salto (limite de saltos);
// - o DNS e resolvido antes e TODOS os enderecos devem ser publicos (barra rebinding simples).

export type ResolverDns = (host: string) => Promise<string[]>

export interface OpcoesFetchSeguro {
  hostsPermitidos: readonly HostPermitido[]
  init?: RequestInit
  timeoutMs?: number
  maxRedirects?: number
  /** Injecao para testes. */
  fetchImpl?: typeof fetch
  resolverDns?: ResolverDns
}

const dnsPadrao: ResolverDns = async (host) => (await lookup(host, { all: true })).map((r) => r.address)

/** true se o endereco IP (v4 ou v6) NAO e publico/roteavel. */
export function ipNaoPublico(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224
    )
  }
  if (v === 6) {
    const l = ip.toLowerCase()
    const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l)
    if (mapeado) return ipNaoPublico(mapeado[1]!)
    return l === '::' || l === '::1' || /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith('ff')
  }
  return true
}

async function validarDestino(url: URL, op: OpcoesFetchSeguro): Promise<void> {
  if (url.protocol !== 'https:') throw new ErroSsrf('somente HTTPS e permitido')
  if (url.username || url.password) throw new ErroSsrf('credenciais na URL nao sao permitidas')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    // IP literal nunca e host de provedor: nao e nome da allowlist e nao pode ser privado.
    throw new ErroSsrf('IP literal nao e permitido')
  }
  if (!hostPermitido(host, op.hostsPermitidos)) throw new ErroSsrf('host fora da allowlist')
  const enderecos = await (op.resolverDns ?? dnsPadrao)(host)
  if (enderecos.length === 0 || enderecos.some(ipNaoPublico)) throw new ErroSsrf('host resolve para rede nao publica')
}

export async function fetchSeguro(urlInicial: string, op: OpcoesFetchSeguro): Promise<Response> {
  const f = op.fetchImpl ?? fetch
  const maxRedirects = op.maxRedirects ?? 3
  let url: URL
  try {
    url = new URL(urlInicial)
  } catch {
    throw new ErroSsrf('URL invalida')
  }
  for (let salto = 0; ; salto++) {
    await validarDestino(url, op)
    const resp = await f(url, {
      ...op.init,
      redirect: 'manual',
      signal: op.init?.signal ?? AbortSignal.timeout(op.timeoutMs ?? 10_000),
    })
    if (resp.status < 300 || resp.status >= 400 || !resp.headers.has('location')) return resp
    if (salto >= maxRedirects) throw new Transitorio('redirects demais', { codigo: 'redirects_excedidos' })
    try {
      url = new URL(resp.headers.get('location')!, url)
    } catch {
      throw new ErroSsrf('Location invalido')
    }
  }
}
