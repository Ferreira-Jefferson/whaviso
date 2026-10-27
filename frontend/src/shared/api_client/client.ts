// api_client: wrapper de fetch para a api REST (prefixo /v1).
//  - Bearer do JWT atual; loja ativa SEMPRE no header `x-loja-id`, nunca no corpo (SEC-001/002).
//  - Resposta validada com o contrato Zod; falha de contrato e erro visivel (resposta_invalida).
//  - Envelope { error: { code, message } } -> ApiError.
//  - 401: renova a sessao UMA vez e repete; se persistir, encerra a sessao (SEC-040).
//    Sem token nunca sai requisicao protegida em silencio.
//  - SEC-020/024: nada de corpo nem header em log.
import type { z } from 'zod'
import { ErroApi } from '../contracts/_generated'
import { ApiError } from './errors'
import { lerLojaAtiva } from './loja_ativa'

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface OpcoesRequisicao {
  /** Schema Zod para validar a resposta em runtime. */
  schema?: z.ZodType<unknown>
  query?: Record<string, string | number | boolean | undefined | null>
  /** Corpo JSON (POST/PUT/PATCH). Nunca pode conter `loja_id`. */
  body?: unknown
  signal?: AbortSignal
  /** Rota publica (ex.: /healthz): sem Bearer e sem x-loja-id. */
  publico?: boolean
  /** Rota fora do escopo de loja (nao envia x-loja-id). */
  semLoja?: boolean
}

export interface DepsApiClient {
  baseUrl: string
  /** Prefixo de versao; '' para rotas fora de /v1. */
  prefixo?: string
  getToken: () => Promise<string | null>
  /** Renova a sessao; devolve o novo token ou null se nao foi possivel. */
  renovarToken: () => Promise<string | null>
  /** Chamado quando a sessao nao pode ser recuperada (logout). */
  aoSessaoExpirada: () => void
  fetchImpl?: typeof fetch
}

const CHAVE_PROIBIDA = 'loja_id'

/** SEC-001/002: o front nunca envia loja_id no corpo. Devolve false se achar a chave. */
export function corpoSemLojaId(valor: unknown, profundidade = 0): boolean {
  if (profundidade > 8 || valor === null || typeof valor !== 'object') return true
  if (Array.isArray(valor)) return valor.every((v) => corpoSemLojaId(v, profundidade + 1))
  for (const [k, v] of Object.entries(valor)) {
    if (k === CHAVE_PROIBIDA) return false
    if (!corpoSemLojaId(v, profundidade + 1)) return false
  }
  return true
}

function montarUrl(base: string, prefixo: string, path: string, query?: OpcoesRequisicao['query']): string {
  const url = `${base.replace(/\/$/, '')}${prefixo}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return undefined
  }
}

function lerRetryAfter(resp: Response): number | null {
  const h = resp.headers.get('retry-after')
  if (!h) return null
  const n = Number(h)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function criarApiClient(deps: DepsApiClient) {
  const prefixo = deps.prefixo ?? '/v1'
  const fazerFetch = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))

  async function enviar(
    metodo: Metodo,
    path: string,
    op: OpcoesRequisicao,
    token: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (!op.publico && token) headers.Authorization = `Bearer ${token}`
    if (!op.publico && !op.semLoja) {
      const loja = lerLojaAtiva()
      if (loja) headers['x-loja-id'] = loja
    }
    if (op.body !== undefined) headers['Content-Type'] = 'application/json'
    try {
      return await fazerFetch(montarUrl(deps.baseUrl, prefixo, path, op.query), {
        method: metodo,
        headers,
        body: op.body !== undefined ? JSON.stringify(op.body) : undefined,
        signal: op.signal,
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      throw new ApiError('rede_indisponivel', 'Não foi possível conectar ao servidor. Verifique sua conexão.', 0)
    }
  }

  async function requisitar<T>(metodo: Metodo, path: string, op: OpcoesRequisicao = {}): Promise<T> {
    if (op.body !== undefined && !corpoSemLojaId(op.body)) {
      throw new Error('api_client: loja_id nao pode ir no corpo (use o header x-loja-id).')
    }

    let token: string | null = null
    if (!op.publico) {
      token = await deps.getToken()
      if (!token) {
        // SEC-040: sem credencial nao ha requisicao protegida silenciosa.
        deps.aoSessaoExpirada()
        throw new ApiError('sessao_expirada', 'Sua sessão expirou. Entre de novo.', 401)
      }
    }

    let resp = await enviar(metodo, path, op, token)

    if (resp.status === 401 && !op.publico) {
      const novo = await deps.renovarToken().catch(() => null)
      if (novo) resp = await enviar(metodo, path, op, novo)
      if (!novo || resp.status === 401) {
        deps.aoSessaoExpirada()
        throw new ApiError('sessao_expirada', 'Sua sessão expirou. Entre de novo.', 401)
      }
    }

    const texto = await resp.text()
    const json: unknown = texto ? safeJson(texto) : undefined

    if (!resp.ok) {
      const env = ErroApi.safeParse(json)
      if (env.success) {
        throw new ApiError(env.data.error.code, env.data.error.message, resp.status, lerRetryAfter(resp))
      }
      throw new ApiError('erro_inesperado', `Erro ${resp.status} ao chamar a api.`, resp.status, lerRetryAfter(resp))
    }

    if (op.schema) {
      const r = op.schema.safeParse(json)
      if (!r.success) {
        throw new ApiError('resposta_invalida', 'A resposta da api não corresponde ao contrato esperado.', resp.status)
      }
      return r.data as T
    }
    return json as T
  }

  return {
    get: <T>(path: string, op?: Omit<OpcoesRequisicao, 'body'>) => requisitar<T>('GET', path, op),
    post: <T>(path: string, op?: OpcoesRequisicao) => requisitar<T>('POST', path, op),
    put: <T>(path: string, op?: OpcoesRequisicao) => requisitar<T>('PUT', path, op),
    patch: <T>(path: string, op?: OpcoesRequisicao) => requisitar<T>('PATCH', path, op),
    delete: <T>(path: string, op?: Omit<OpcoesRequisicao, 'body'>) => requisitar<T>('DELETE', path, op),
  }
}

export type ApiClient = ReturnType<typeof criarApiClient>

/** Retry do TanStack Query: so para erro transitorio (rede/502/503/504), no maximo 2 vezes. */
export function retryTransitorio(tentativa: number, erro: unknown): boolean {
  return tentativa < 2 && erro instanceof ApiError && erro.isTransient
}
