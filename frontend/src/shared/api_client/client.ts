// Wrapper fetch tipado para a `api` REST (prefixo /v1).
// - Injeta Authorization: Bearer <access_token> da sessão Supabase.
// - Trata o envelope de erro { error: { code, message } } → lança ApiError.
// - 401 sinaliza re-login (ApiError.isUnauthorized); 429 rate limit.
// REGRA: todo dado trafega por aqui, nunca por supabase.from()/functions.invoke().
import { z } from 'zod'
import { getAccessToken } from '../supabase'
import { erroResposta } from '../contracts'
import { ApiError } from './errors'

const BASE_URL = import.meta.env.VITE_API_URL
const PREFIXO = '/v1'

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface RequestOptions {
  /** Schema Zod para validar a resposta em runtime. */
  schema?: z.ZodType<unknown>
  /** Query params (serializados, ignorando undefined/null). */
  query?: Record<string, string | number | boolean | undefined | null>
  /** Corpo JSON (apenas POST/PATCH). */
  body?: unknown
  signal?: AbortSignal
}

function montarUrl(
  path: string,
  query?: RequestOptions['query'],
): string {
  const base = `${BASE_URL}${PREFIXO}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return base
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

async function request<T>(
  metodo: Metodo,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let resp: Response
  try {
    resp = await fetch(montarUrl(path, options.query), {
      method: metodo,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch {
    throw new ApiError(
      'rede_indisponivel',
      'Não foi possível conectar ao servidor. Verifique sua conexão.',
      0,
    )
  }

  const texto = await resp.text()
  const json: unknown = texto ? safeJson(texto) : undefined

  if (!resp.ok) {
    const parsed = erroResposta.safeParse(json)
    if (parsed.success) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, resp.status)
    }
    throw new ApiError(
      'erro_inesperado',
      `Erro ${resp.status} ao chamar a api.`,
      resp.status,
    )
  }

  if (options.schema) {
    const parsed = options.schema.safeParse(json)
    if (!parsed.success) {
      throw new ApiError(
        'resposta_invalida',
        'A resposta da api não corresponde ao contrato esperado.',
        resp.status,
      )
    }
    return parsed.data as T
  }

  return json as T
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return undefined
  }
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T> =>
    request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('POST', path, options),
  patch: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T> =>
    request<T>('DELETE', path, options),
}

export type ApiClient = typeof apiClient
