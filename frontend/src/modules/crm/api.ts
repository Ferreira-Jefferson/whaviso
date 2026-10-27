// Camada de dados do modulo crm: RFM, segmentos, o que a loja vende, ficha e opt-out.
// Estado de servidor via TanStack Query; dados so pelo api_client. Raiz de cache ['crm'].
// Este modulo NUNCA importa outro modulo. Nenhum telefone trafega aqui (PII fica em clientes).
//
// Mapa REAL do backend (backend/apps/api/src/modules/crm):
//   GET /v1/crm/clientes?segmento&contactavel&cursor&limite   lista por cursor
//   GET /v1/crm/clientes/:id                                  ficha (metricas, consentimento, favoritos, pedidos)
//   GET /v1/crm/resumo                                        totais e quebra por segmento
//   GET /v1/crm/itens?dias&limite                             o que a loja vende
//   PUT /v1/crm/clientes/:id/consentimento                    opt-out / opt-in de marketing
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  CrmClienteDetalheSaida,
  CrmClientesSaida,
  CrmConsentimentoEntrada,
  CrmConsentimento,
  CrmItensSaida,
  CrmResumoSaida,
  type CrmSegmento,
} from '@/shared/contracts/_generated/crm'

export const RAIZ = 'crm'

export type CrmCliente = z.infer<typeof CrmClientesSaida>['itens'][number]
export type CrmDetalhe = z.infer<typeof CrmClienteDetalheSaida>
export type CrmResumo = z.infer<typeof CrmResumoSaida>
export type CrmItens = z.infer<typeof CrmItensSaida>
export type CrmConsentimentoDto = z.infer<typeof CrmConsentimento>
export type { CrmSegmento }

const LIMITE = 20

export interface FiltroCrm {
  segmento: CrmSegmento | null
  /** true: so quem pode receber campanha (sem opt-out). */
  soContactaveis: boolean
}

export function useCrmResumo() {
  return useQuery({
    queryKey: [RAIZ, 'resumo'],
    queryFn: ({ signal }) => apiClient.get<CrmResumo>('/crm/resumo', { schema: CrmResumoSaida, signal }),
  })
}

export function useCrmClientes(filtro: FiltroCrm) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'lista', filtro.segmento, filtro.soContactaveis],
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<z.infer<typeof CrmClientesSaida>>('/crm/clientes', {
        query: {
          segmento: filtro.segmento ?? undefined,
          contactavel: filtro.soContactaveis ? 'true' : undefined,
          cursor: pageParam || undefined,
          limite: LIMITE,
        },
        schema: CrmClientesSaida,
        signal,
      }),
    initialPageParam: '' as string,
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

export function useCrmDetalhe(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'detalhe', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<CrmDetalhe>(`/crm/clientes/${id}`, { schema: CrmClienteDetalheSaida, signal }),
  })
}

export function useCrmItens(dias: number) {
  return useQuery({
    queryKey: [RAIZ, 'itens', dias],
    queryFn: ({ signal }) =>
      apiClient.get<CrmItens>('/crm/itens', { query: { dias, limite: 20 }, schema: CrmItensSaida, signal }),
  })
}

/** PUT /v1/crm/clientes/:id/consentimento. Invalida o CRM inteiro (lista, resumo e ficha). */
export function useAlterarConsentimento() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: string; optOut: boolean; motivo?: string }>({
    mutationFn: ({ id, optOut, motivo }) => {
      const body = CrmConsentimentoEntrada.parse({
        opt_out_marketing: optOut,
        ...(motivo ? { motivo } : {}),
        origem: 'painel',
      })
      return apiClient.put<unknown>(`/crm/clientes/${id}/consentimento`, { body })
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}
