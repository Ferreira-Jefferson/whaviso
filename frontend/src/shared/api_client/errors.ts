// Erro tipado do envelope { error: { code, message } } da api (SEC-020: nunca carrega
// corpo nem headers da requisicao; so o code/message publicos do envelope).
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  /** Segundos sugeridos pelo header Retry-After (429/503), quando presente. */
  readonly retryAfterSegundos: number | null

  constructor(code: string, message: string, status: number, retryAfterSegundos: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.retryAfterSegundos = retryAfterSegundos
  }

  /** 401: sessao invalida/expirada (o client ja tentou refresh uma vez). */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** 403: sem permissao para a acao. */
  get isForbidden(): boolean {
    return this.status === 403
  }

  /** 404 (inclui loja fora do escopo: a api nao confirma existencia). */
  get isNotFound(): boolean {
    return this.status === 404
  }

  /** 429: limite de requisicoes. */
  get isRateLimited(): boolean {
    return this.status === 429
  }

  /** Falha de rede (status 0) ou indisponibilidade do servidor: vale tentar de novo. */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504
  }

  /** Bloqueio por saldo/agenda (legado do billing de creditos): decide pelo code. */
  get isLimiteDeSaldo(): boolean {
    return this.code === 'saldo_insuficiente' || this.code === 'agenda_cheia'
  }
}
