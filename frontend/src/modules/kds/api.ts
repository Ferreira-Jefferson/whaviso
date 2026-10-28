// Camada de dados da tela de cozinha (KDS). Reusa os endpoints de pedidos:
//  - GET /v1/pedidos            : as colunas do kanban (daqui saem os pedidos ativos da cozinha);
//  - GET /v1/pedidos/:id        : o detalhe de cada pedido (os itens que a cozinha precisa ver);
//  - POST /v1/pedidos/:id/status: avanca o pedido (iniciar preparo, marcar pronto).
// A raiz de cache e ['pedidos'] (a MESMA do painel): o realtime (`pedido.atualizado`) ja invalida
// essa raiz via MAPA_INVALIDACAO, entao a cozinha se atualiza sozinha quando um pedido muda.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  PedidoDetalheSaida,
  PedidoKanbanSaida,
  type PedidoStatusEntrada,
} from '@/shared/contracts/_generated/pedidos'

/** Mesma raiz do modulo pedidos: o realtime invalida ['pedidos'] e a cozinha reflete ao vivo. */
export const RAIZ = 'pedidos'

/** GET /v1/pedidos: o kanban do dia (a cozinha usa as colunas `novo` e `em_preparo`). */
export function useQuadroCozinha(data: string) {
  return useQuery({
    queryKey: [RAIZ, 'kanban', { data, cozinha: true }],
    queryFn: ({ signal }) =>
      apiClient.get<PedidoKanbanSaida>('/pedidos', {
        query: { data, limite: 100 },
        schema: PedidoKanbanSaida,
        signal,
      }),
    // A cozinha e um painel sempre aberto: um refetch suave sustenta o tempo mesmo sem evento.
    refetchInterval: 60_000,
  })
}

/** GET /v1/pedidos/:id para cada pedido ativo: traz os itens (o kanban nao os carrega). */
export function useDetalhesPedidos(ids: readonly string[]) {
  const resultados = useQueries({
    queries: ids.map((id) => ({
      queryKey: [RAIZ, 'detalhe', id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiClient.get<PedidoDetalheSaida>(`/pedidos/${id}`, { schema: PedidoDetalheSaida, signal }),
      staleTime: 30_000,
    })),
  })
  const porId = new Map<string, PedidoDetalheSaida>()
  for (const r of resultados) if (r.data) porId.set(r.data.id, r.data)
  return { porId, carregando: resultados.some((r) => r.isPending) }
}

/** POST /v1/pedidos/:id/status: avanca o pedido (iniciar preparo / marcar pronto). */
export function useAvancarPedido() {
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
