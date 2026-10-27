import { ApiError } from '@/shared/api_client'

/** Mensagem do servidor (envelope de erro) quando houver; senao o texto padrao. */
export function mensagemDeErro(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}
