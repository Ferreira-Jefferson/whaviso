// Deteccao do erro de acesso nao liberado (gate da allowlist no bootstrap de conta). A api responde
// 403 { error: { code: 'acesso_nao_aprovado' } } quando o e-mail logado ainda nao foi liberado.
import { ApiError } from '@/shared/api_client'

export const CODIGO_ACESSO_NAO_APROVADO = 'acesso_nao_aprovado'

/** true se o erro e o gate da allowlist (e-mail ainda nao liberado). */
export function ehAcessoNaoAprovado(err: unknown): boolean {
  return err instanceof ApiError && err.code === CODIGO_ACESSO_NAO_APROVADO
}
