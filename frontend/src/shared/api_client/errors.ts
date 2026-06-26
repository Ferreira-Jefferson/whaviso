// Erro tipado do envelope { error: { code, message } } da api.
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }

  /** 401 → sessão inválida/expirada; a UI deve sinalizar re-login. */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** 429 → rate limit. */
  get isRateLimited(): boolean {
    return this.status === 429
  }

  /** Bloqueio por SALDO/agenda → CTA de recarga graciosa, sem destruir trabalho (E11
   * H11.9). O backend responde 422 (regra de negócio) com um destes codes; a UI decide
   * pelo code, não pelo status:
   *   - saldo_insuficiente: faltam créditos para ativar/enviar (recarregue).
   *   - agenda_cheia: teto de agenda (balde único) atingido (recarregue ou arquive). */
  get isLimiteDeSaldo(): boolean {
    return this.code === 'saldo_insuficiente' || this.code === 'agenda_cheia'
  }
}
