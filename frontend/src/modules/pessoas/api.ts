// Camada de dados do módulo pessoas (E15): visão por pessoa/contato.
// A pessoa é referenciada por um id de COMBINADO (UUID): a api resolve o telefone da
// outra ponta no servidor (H15.7). Estado de servidor 100% via TanStack Query.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/shared/api_client'
import {
  listaClientesResposta,
  pessoaCombinadosResposta,
  pessoaResumoResposta,
  renomearClienteResposta,
  type ListaClientesResposta,
  type PessoaCombinadosResposta,
  type PessoaResumoResposta,
  type RenomearClienteResposta,
} from '@/shared/contracts'

export const pessoasKeys = {
  todos: ['pessoas'] as const,
  lista: ['pessoas', 'lista'] as const,
  resumo: (avisoId: string) => ['pessoas', 'resumo', avisoId] as const,
  combinados: (avisoId: string) => ['pessoas', 'combinados', avisoId] as const,
}

/**
 * GET /v1/pessoas (E18 H18.4): lista central de clientes (agregada por telefone). Telefone só
 * no corpo (nunca em rota/log); cada cliente traz um ref_aviso_id representativo. Degrada
 * 404 -> [] (backend antigo sem a rota).
 */
export function usePessoas() {
  return useQuery({
    queryKey: pessoasKeys.lista,
    queryFn: async ({ signal }) => {
      try {
        return await apiClient.get<ListaClientesResposta>('/pessoas', {
          schema: listaClientesResposta,
          signal,
        })
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.code === 'rota_inexistente')) {
          return { itens: [], total: 0 }
        }
        throw e
      }
    },
  })
}

/**
 * PATCH /v1/pessoas/:avisoId (E15 H15.8): renomeia o cliente. O telefone é resolvido no
 * servidor a partir do avisoId (nunca telefone em rota/log). `nomeAtual` (opcional) escopa a
 * um GRUPO de nome; ausente = número inteiro. onSettled invalida ['pessoas'], ['avisos'] e
 * ['painel'] (o nome muda em toda parte que exibe combinados daquele número); sem otimismo
 * na lista porque, por grupo, nem sempre o nome exibido do cliente (o mais recente) muda.
 */
export function useRenomearCliente() {
  const qc = useQueryClient()
  return useMutation<
    RenomearClienteResposta,
    Error,
    { refAvisoId: string; telefone: string; nome: string; nomeAtual?: string }
  >({
    mutationFn: ({ refAvisoId, nome, nomeAtual }) =>
      apiClient.patch<RenomearClienteResposta>(`/pessoas/${refAvisoId}`, {
        body: { nome, ...(nomeAtual && { nome_atual: nomeAtual }) },
        schema: renomearClienteResposta,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: pessoasKeys.todos })
      void qc.invalidateQueries({ queryKey: ['avisos'] })
      void qc.invalidateQueries({ queryKey: ['painel'] })
    },
  })
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
