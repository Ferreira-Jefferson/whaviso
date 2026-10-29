// Camada de dados do modulo despacho: painel de despacho (pedidos prontos, corridas abertas,
// motoboys com carga) e as acoes manuais de atribuir motoboy e montar/sequenciar a corrida.
// Estado de servidor via TanStack Query; dados so pelo api_client. Raiz de cache ['despacho'].
// A loja vem do header x-loja-id, nunca do corpo. Dinheiro em centavos.
//
// Mapa REAL do backend (backend/apps/api/src/modules/despacho, prefixo /v1/despacho):
//   GET  /despacho                                painel { pedidos_prontos, corridas, motoboys }
//   POST /despacho/pedidos/:id/motoboy            { motoboy_id }  atribui motoboy ao pedido
//   POST /despacho/corridas                       { motoboy_id?, pedido_ids? }  -> CorridaSaida (201)
//   POST /despacho/corridas/:id/pedidos           { pedido_ids }  adiciona pedidos
//   POST /despacho/corridas/:id/pedidos/:pedidoId/remover
//   PUT  /despacho/corridas/:id/ordem             { pedido_ids }  lista COMPLETA na nova ordem
//   POST /despacho/corridas/:id/motoboy           { motoboy_id }
//   POST /despacho/corridas/:id/despachar|concluir|cancelar
// O status do pedido nunca muda aqui (e do modulo pedidos): so motoboy, corrida e ordem de parada.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  CorridaSaida,
  DespachoPainelSaida,
  type CorridaSaida as CorridaDto,
  type DespachoPainelSaida as PainelDto,
  type MotoboyCargaSaida,
  type ParadaSaida,
  type PedidoProntoSaida,
} from '@/shared/contracts/_generated/despacho'

export const RAIZ = 'despacho'

export type Painel = PainelDto
export type Corrida = CorridaDto
export type Parada = ParadaSaida
export type PedidoPronto = PedidoProntoSaida
export type MotoboyCarga = MotoboyCargaSaida

/** GET /v1/despacho: o SSE (pedido.atualizado) invalida a raiz; o intervalo e so rede de seguranca. */
export function useDespachoPainel() {
  return useQuery({
    queryKey: [RAIZ, 'painel'],
    refetchInterval: 120_000,
    queryFn: ({ signal }) => apiClient.get<Painel>('/despacho', { schema: DespachoPainelSaida, signal }),
  })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

/** POST /v1/despacho/pedidos/:id/motoboy: atribuicao individual (sem corrida). */
export function useAtribuirMotoboy() {
  const invalidar = useInvalidar()
  return useMutation<unknown, Error, { pedidoId: string; motoboyId: string }>({
    mutationFn: ({ pedidoId, motoboyId }) =>
      apiClient.post<unknown>(`/despacho/pedidos/${pedidoId}/motoboy`, { body: { motoboy_id: motoboyId } }),
    onSuccess: invalidar,
  })
}

/** POST /v1/despacho/corridas: nasce em `montando`, opcionalmente com motoboy e pedidos (ordem = parada). */
export function useCriarCorrida() {
  const invalidar = useInvalidar()
  return useMutation<Corrida, Error, { motoboyId?: string; pedidoIds?: string[] }>({
    mutationFn: ({ motoboyId, pedidoIds }) =>
      apiClient.post<Corrida>('/despacho/corridas', {
        body: {
          ...(motoboyId ? { motoboy_id: motoboyId } : {}),
          ...(pedidoIds && pedidoIds.length > 0 ? { pedido_ids: pedidoIds } : {}),
        },
        schema: CorridaSaida,
      }),
    onSuccess: invalidar,
  })
}

/** POST /v1/despacho/corridas/:id/pedidos. */
export function useAdicionarPedidos() {
  const invalidar = useInvalidar()
  return useMutation<unknown, Error, { corridaId: string; pedidoIds: string[] }>({
    mutationFn: ({ corridaId, pedidoIds }) =>
      apiClient.post<unknown>(`/despacho/corridas/${corridaId}/pedidos`, { body: { pedido_ids: pedidoIds } }),
    onSuccess: invalidar,
  })
}

/** POST /v1/despacho/corridas/:id/pedidos/:pedidoId/remover. */
export function useRemoverPedidoDaCorrida() {
  const invalidar = useInvalidar()
  return useMutation<unknown, Error, { corridaId: string; pedidoId: string }>({
    mutationFn: ({ corridaId, pedidoId }) =>
      apiClient.post<unknown>(`/despacho/corridas/${corridaId}/pedidos/${pedidoId}/remover`),
    onSuccess: invalidar,
  })
}

/** PUT /v1/despacho/corridas/:id/ordem: lista COMPLETA dos pedidos na nova ordem de parada. */
export function useReordenarParadas() {
  const invalidar = useInvalidar()
  return useMutation<unknown, Error, { corridaId: string; pedidoIds: string[] }>({
    mutationFn: ({ corridaId, pedidoIds }) =>
      apiClient.put<unknown>(`/despacho/corridas/${corridaId}/ordem`, { body: { pedido_ids: pedidoIds } }),
    onSuccess: invalidar,
  })
}

/** POST /v1/despacho/corridas/:id/motoboy: define/troca o motoboy de toda a corrida. */
export function useTrocarMotoboyDaCorrida() {
  const invalidar = useInvalidar()
  return useMutation<unknown, Error, { corridaId: string; motoboyId: string }>({
    mutationFn: ({ corridaId, motoboyId }) =>
      apiClient.post<unknown>(`/despacho/corridas/${corridaId}/motoboy`, { body: { motoboy_id: motoboyId } }),
    onSuccess: invalidar,
  })
}

export type AcaoCorrida = 'despachar' | 'concluir' | 'cancelar'

/** POST /v1/despacho/corridas/:id/despachar|concluir|cancelar. */
export function useAcaoCorrida() {
  const invalidar = useInvalidar()
  return useMutation<unknown, Error, { corridaId: string; acao: AcaoCorrida }>({
    mutationFn: ({ corridaId, acao }) => apiClient.post<unknown>(`/despacho/corridas/${corridaId}/${acao}`),
    onSuccess: invalidar,
  })
}
