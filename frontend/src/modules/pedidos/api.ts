// Camada de dados do kanban de pedidos. Raiz de cache ['pedidos'] (invalidada pelo realtime).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  PedidoDetalheSaida,
  PedidoKanbanSaida,
  type ColunaKanban,
  type PedidoStatusEntrada,
} from '@/shared/contracts/_generated/pedidos'
import type { ModalidadePedido, OrigemPedido } from '@/shared/contracts/_generated/enums'

export interface FiltrosKanban {
  modalidade?: ModalidadePedido
  origem?: OrigemPedido
  /** Dia de negocio AAAA-MM-DD (America/Sao_Paulo). */
  data: string
}

export const RAIZ = 'pedidos'

/** GET /v1/pedidos: as 5 colunas do kanban. */
export function useKanban(filtros: FiltrosKanban) {
  return useQuery({
    queryKey: [RAIZ, 'kanban', filtros],
    queryFn: ({ signal }) =>
      apiClient.get<PedidoKanbanSaida>('/pedidos', {
        query: { ...filtros, limite: 100 },
        schema: PedidoKanbanSaida,
        signal,
      }),
  })
}

/** POST /v1/pedidos/:id/status: avanca (ou marca problema, com motivo). */
export function useMudarStatus() {
  const qc = useQueryClient()
  return useMutation<PedidoDetalheSaida, Error, { id: string } & PedidoStatusEntrada>({
    mutationFn: ({ id, para, motivo }) =>
      apiClient.post<PedidoDetalheSaida>(`/pedidos/${id}/status`, {
        body: motivo ? { para, motivo } : { para },
        schema: PedidoDetalheSaida,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}

export type { ColunaKanban }
