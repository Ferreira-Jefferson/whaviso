// Camada de dados do módulo painel: GET /v1/painel/resumo + /v1/painel/pendencias.
// Estado de servidor 100% via TanStack Query; nunca supabase.from().
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  painelPendenciasResposta,
  painelResumoResposta,
  type PainelPendenciasResposta,
  type PainelResumoResposta,
} from '@/shared/contracts'

export interface PeriodoResumo {
  de?: string
  ate?: string
}

export const painelKeys = {
  todos: ['painel'] as const,
  resumo: (periodo: PeriodoResumo) => ['painel', 'resumo', periodo] as const,
  pendencias: ['painel', 'pendencias'] as const,
}

/** GET /v1/painel/resumo: totais por PAPEL (centavos) calculados no backend. */
export function usePainelResumo(periodo: PeriodoResumo) {
  return useQuery({
    queryKey: painelKeys.resumo(periodo),
    queryFn: ({ signal }) =>
      apiClient.get<PainelResumoResposta>('/painel/resumo', {
        schema: painelResumoResposta,
        query: { de: periodo.de, ate: periodo.ate },
        signal,
      }),
  })
}

/** GET /v1/painel/pendencias: "precisa de você" (aguarda ação do usuário). */
export function usePainelPendencias() {
  return useQuery({
    queryKey: painelKeys.pendencias,
    queryFn: ({ signal }) =>
      apiClient.get<PainelPendenciasResposta>('/painel/pendencias', {
        schema: painelPendenciasResposta,
        signal,
      }),
  })
}
