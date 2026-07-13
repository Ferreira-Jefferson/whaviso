// Camada de dados do módulo pessoas (E15): visão por pessoa/contato.
// A pessoa é referenciada por um id de COMBINADO (UUID): a api resolve o telefone da
// outra ponta no servidor (H15.7). Estado de servidor 100% via TanStack Query.
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  pessoaCombinadosResposta,
  pessoaResumoResposta,
  type PessoaCombinadosResposta,
  type PessoaResumoResposta,
} from '@/shared/contracts'

export const pessoasKeys = {
  todos: ['pessoas'] as const,
  resumo: (avisoId: string) => ['pessoas', 'resumo', avisoId] as const,
  combinados: (avisoId: string) => ['pessoas', 'combinados', avisoId] as const,
}

/** GET /v1/pessoas/:avisoId/resumo: telefone resolvido no servidor + os quatro totais. */
export function usePessoaResumo(avisoId: string) {
  return useQuery({
    queryKey: pessoasKeys.resumo(avisoId),
    queryFn: ({ signal }) =>
      apiClient.get<PessoaResumoResposta>(`/pessoas/${avisoId}/resumo`, {
        schema: pessoaResumoResposta,
        signal,
      }),
  })
}

/** GET /v1/pessoas/:avisoId/combinados: combinados do número, agrupados por nome. */
export function usePessoaCombinados(avisoId: string) {
  return useQuery({
    queryKey: pessoasKeys.combinados(avisoId),
    queryFn: ({ signal }) =>
      apiClient.get<PessoaCombinadosResposta>(`/pessoas/${avisoId}/combinados`, {
        schema: pessoaCombinadosResposta,
        signal,
      }),
  })
}
