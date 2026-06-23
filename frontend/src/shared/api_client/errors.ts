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

  /** Bloqueio por plano → CTA de upgrade graciosa, sem destruir trabalho (H11.6).
   * O backend responde 422 (regra de negócio) com um destes codes; a UI decide pelo
   * code, não pelo status:
   *   - plano_somente_leitura: free mantém agenda/visualização, mas não envia.
   *   - agenda_cheia: capacidade da agenda (balde único) atingida.
   *   - limite_plano_atingido: legado (mantido por compatibilidade). */
  get isLimiteDePlano(): boolean {
    return (
      this.code === 'plano_somente_leitura' ||
      this.code === 'agenda_cheia' ||
      this.code === 'limite_plano_atingido'
    )
  }
}
