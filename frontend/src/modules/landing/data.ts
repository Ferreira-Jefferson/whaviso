// Camada de dados do módulo landing: planos públicos para a seção de preços.
// GET /v1/billing/planos é público no backend (sem preHandler de auth), então a
// landing pode buscá-lo sem sessão. Estado de servidor via TanStack Query; dados
// só pelo api_client. Este módulo NUNCA importa outro módulo.
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { listaPlanosResposta, type ListaPlanosResposta } from '@/shared/contracts'

/** GET /v1/billing/planos: catálogo público (preços em centavos). */
export function usePlanos() {
  return useQuery({
    queryKey: ['landing', 'planos'],
    staleTime: 5 * 60_000,
    retry: 0,
    queryFn: ({ signal }) =>
      apiClient
        .get<ListaPlanosResposta>('/billing/planos', {
          schema: listaPlanosResposta,
          signal,
        })
        .then((r) => r.planos),
  })
}
