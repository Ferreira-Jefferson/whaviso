// QA harness (dev-only): substitui a INSTANCIA do apiClient por uma que responde com os mocks
// locais, ignorando o schema Zod, o Bearer e o Supabase. So e usada quando o Vite roda em
// mode 'qa' (alias exato de '@/shared/api_client'); nunca entra no build de producao.
// Reexporta o resto do modulo real para nao mudar o contrato de import de ninguem.
export { criarApiClient, retryTransitorio, corpoSemLojaId } from '@/shared/api_client/client'
export type { ApiClient, DepsApiClient, OpcoesRequisicao } from '@/shared/api_client/client'
export { ApiError } from '@/shared/api_client/errors'
export { definirLojaAtiva, lerLojaAtiva } from '@/shared/api_client/loja_ativa'

import type { ApiClient } from '@/shared/api_client/client'
import { mockFor } from '../mocks'

function responder<T>(path: string): Promise<T> {
  return Promise.resolve(mockFor(path) as T)
}

export const apiClient: ApiClient = {
  get: <T>(path: string) => responder<T>(path),
  post: <T>(path: string) => responder<T>(path),
  put: <T>(path: string) => responder<T>(path),
  patch: <T>(path: string) => responder<T>(path),
  delete: <T>(path: string) => responder<T>(path),
}
