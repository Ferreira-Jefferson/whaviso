export { apiClient } from './instancia'
export {
  criarApiClient,
  retryTransitorio,
  corpoSemLojaId,
  type ApiClient,
  type DepsApiClient,
  type OpcoesRequisicao,
} from './client'
export { ApiError } from './errors'
export { definirLojaAtiva, lerLojaAtiva } from './loja_ativa'
