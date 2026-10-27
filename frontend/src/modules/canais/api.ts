// Camada de dados dos canais externos (raiz de cache ['canais']).
// A credencial do canal e WRITE-ONLY: so `useConectarCanal` a envia; as leituras trazem apenas
// metadado (ativo, ultimos4, config, ultima sincronizacao). Loja ativa no header x-loja-id.
// Contratos: @/shared/contracts/_generated/canais.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  CanaisSaida,
  CanalEstado,
  CanalPedidosSaida,
  CanalSincronizarSaida,
  type CanalConectarEntrada,
  type CanalPatch,
  type CanalTipo,
} from '@/shared/contracts/_generated/canais'

export const RAIZ = 'canais'

type PedidosCanal = z.infer<typeof CanalPedidosSaida>['pedidos']

/** GET /v1/canais: estado de cada canal conectado (sem credencial). */
export function useCanais() {
  return useQuery({
    queryKey: [RAIZ, 'estado'],
    queryFn: ({ signal }) => apiClient.get<z.infer<typeof CanaisSaida>>('/canais', { schema: CanaisSaida, signal }),
    select: (d): CanalEstado[] => d.canais,
  })
}

/** GET /v1/canais/pedidos: pedidos ja importados dos canais. */
export function usePedidosDosCanais() {
  return useQuery({
    queryKey: [RAIZ, 'pedidos'],
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof CanalPedidosSaida>>('/canais/pedidos', { schema: CanalPedidosSaida, signal }),
    select: (d): PedidosCanal => d.pedidos,
  })
}

function useInvalidarRaiz() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

/** PUT /v1/canais: conecta ou troca a credencial (so o dono). A resposta traz so metadado. */
export function useConectarCanal() {
  const invalidar = useInvalidarRaiz()
  return useMutation<CanalEstado, Error, CanalConectarEntrada>({
    mutationFn: (body) => apiClient.put<CanalEstado>('/canais', { body, schema: CanalEstado }),
    onSettled: invalidar,
  })
}

/** PATCH /v1/canais/:canal: ativa/desativa ou ajusta a config, sem reenviar a credencial. */
export function useAjustarCanal() {
  const invalidar = useInvalidarRaiz()
  return useMutation<CanalEstado, Error, { canal: CanalTipo; body: CanalPatch }>({
    mutationFn: ({ canal, body }) => apiClient.patch<CanalEstado>(`/canais/${canal}`, { body, schema: CanalEstado }),
    onSettled: invalidar,
  })
}

/** POST /v1/canais/:canal/sincronizar: puxa pedidos do provedor (501 enquanto nao houver provedor). */
export function useSincronizarCanal() {
  const invalidar = useInvalidarRaiz()
  return useMutation<CanalSincronizarSaida, Error, CanalTipo>({
    mutationFn: (canal) =>
      apiClient.post<CanalSincronizarSaida>(`/canais/${canal}/sincronizar`, { schema: CanalSincronizarSaida }),
    onSettled: invalidar,
  })
}
