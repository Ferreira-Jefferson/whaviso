// Camada de dados do modulo zonas: zonas de entrega da loja ativa (taxa, valor do motoboy,
// pedido minimo e frete gratis). Estado de servidor via TanStack Query; dados so pelo
// api_client. Raiz de cache ['zonas']. A loja efetiva vem do header x-loja-id, nunca do corpo.
// Dinheiro sempre em centavos (inteiro).
//
// Mapa REAL do backend (backend/apps/api/src/modules/zonas_entrega, prefixo /v1/zonas):
//   GET  /zonas                 lista { itens } (query: incluir_inativas=true)
//   POST /zonas                 cria (bairro | poligono | raio) -> ZonaSaida (201)
//   PATCH /zonas/:id            edita parcial -> ZonaSaida
//   POST /zonas/:id/ativar|desativar
//   POST /zonas/lote            varios bairros com os mesmos valores (transacional)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  ZonaListaSaida,
  ZonaSaida,
  type ZonaDto,
  type ZonaLote,
  type ZonaNova,
  type ZonaPatch,
} from '@/shared/contracts/_generated/zonas_entrega'

export const RAIZ = 'zonas'

export type Zona = ZonaDto

/** GET /v1/zonas: zonas da loja. `incluirInativas` traz tambem as desativadas. */
export function useZonas(incluirInativas: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'lista', incluirInativas],
    queryFn: ({ signal }) =>
      apiClient.get<{ itens: Zona[] }>('/zonas', {
        query: { incluir_inativas: incluirInativas ? 'true' : undefined },
        schema: ZonaListaSaida,
        signal,
      }),
  })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

/** POST /v1/zonas. */
export function useCriarZona() {
  const invalidar = useInvalidar()
  return useMutation<Zona, Error, ZonaNova>({
    mutationFn: (body) => apiClient.post<Zona>('/zonas', { body, schema: ZonaSaida }),
    onSuccess: invalidar,
  })
}

/** PATCH /v1/zonas/:id. */
export function useAtualizarZona() {
  const invalidar = useInvalidar()
  return useMutation<Zona, Error, { id: string; patch: ZonaPatch }>({
    mutationFn: ({ id, patch }) => apiClient.patch<Zona>(`/zonas/${id}`, { body: patch, schema: ZonaSaida }),
    onSuccess: invalidar,
  })
}

/** POST /v1/zonas/:id/ativar|desativar ("excluir" = desativar; zona nunca some). */
export function useAlternarZona() {
  const invalidar = useInvalidar()
  return useMutation<Zona, Error, { id: string; ativar: boolean }>({
    mutationFn: ({ id, ativar }) =>
      apiClient.post<Zona>(`/zonas/${id}/${ativar ? 'ativar' : 'desativar'}`, { schema: ZonaSaida }),
    onSuccess: invalidar,
  })
}

/** POST /v1/zonas/lote: importacao rapida de bairros (tudo ou nada). */
export function useCriarZonasEmLote() {
  const invalidar = useInvalidar()
  return useMutation<unknown, Error, ZonaLote>({
    mutationFn: (body) => apiClient.post<unknown>('/zonas/lote', { body }),
    onSuccess: invalidar,
  })
}
