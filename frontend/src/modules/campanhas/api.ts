// Camada de dados do modulo campanhas: campanhas de WhatsApp da loja sobre o consumidor final.
// Estado de servidor via TanStack Query; dados so pelo api_client. Raiz de cache ['campanhas'].
// Este modulo NUNCA importa outro modulo (os numeros de origem vem do mesmo endpoint REST, via apiClient).
//
// Mapa REAL do backend (backend/apps/api/src/modules/campanhas):
//   POST /v1/campanhas                   cria rascunho
//   GET  /v1/campanhas                   lista { itens }
//   GET  /v1/campanhas/:id               detalhe (variaveis + resumo de entrega)
//   GET  /v1/campanhas/:id/destinatarios estimativa do publico (ja sem opt-out)
//   POST /v1/campanhas/:id/disparar      enfileira (so em rascunho)
//   POST /v1/campanhas/:id/cancelar      aborta envios ainda nao enviados
//   GET  /v1/numeros                     numeros de origem (contrato numeros_whatsapp)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  CampanhaCancelarSaida,
  CampanhaDestinatariosSaida,
  CampanhaDetalheSaida,
  CampanhaDisparoSaida,
  CampanhaEntrada,
  CampanhaItem,
  CampanhasSaida,
  type CampanhaSegmento,
  type CampanhaStatus,
} from '@/shared/contracts/_generated/campanhas'
import { listaNumerosSaida } from '@/shared/contracts/_generated/numeros_whatsapp'

export const RAIZ = 'campanhas'

export type Campanha = z.infer<typeof CampanhaItem>
export type CampanhaDetalhe = z.infer<typeof CampanhaDetalheSaida>
export type Destinatarios = z.infer<typeof CampanhaDestinatariosSaida>
export type CampanhaNovaEntrada = z.input<typeof CampanhaEntrada>
export type { CampanhaSegmento, CampanhaStatus }

export function useCampanhas() {
  return useQuery({
    queryKey: [RAIZ, 'lista'],
    queryFn: ({ signal }) => apiClient.get<z.infer<typeof CampanhasSaida>>('/campanhas', { schema: CampanhasSaida, signal }),
  })
}

/** Detalhe; enquanto enfileirada acompanha a entrega com polling leve (o zap drena a outbox). */
export function useCampanha(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'detalhe', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<CampanhaDetalhe>(`/campanhas/${id}`, { schema: CampanhaDetalheSaida, signal }),
    refetchInterval: (q) => (q.state.data?.status === 'enfileirada' ? 15_000 : false),
  })
}

/** Estimativa do publico (quantos recebem). Sempre fresca: o opt-out pode mudar a qualquer hora. */
export function useDestinatarios(id: string | null, habilitado: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'destinatarios', id],
    enabled: id != null && habilitado,
    staleTime: 0,
    queryFn: ({ signal }) =>
      apiClient.get<Destinatarios>(`/campanhas/${id}/destinatarios`, { schema: CampanhaDestinatariosSaida, signal }),
  })
}

/** Numeros de WhatsApp conectados da loja (origem do disparo). */
export function useNumerosOrigem() {
  return useQuery({
    queryKey: [RAIZ, 'numeros'],
    queryFn: async ({ signal }) => {
      const r = await apiClient.get<z.infer<typeof listaNumerosSaida>>('/numeros', { schema: listaNumerosSaida, signal })
      return r.numeros.filter((n) => n.status === 'conectado')
    },
  })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

export function useCriarCampanha() {
  const invalidar = useInvalidar()
  return useMutation<Campanha, Error, CampanhaNovaEntrada>({
    mutationFn: (body) => apiClient.post<Campanha>('/campanhas', { body: CampanhaEntrada.parse(body), schema: CampanhaItem }),
    onSettled: invalidar,
  })
}

export function useDispararCampanha() {
  const invalidar = useInvalidar()
  return useMutation<z.infer<typeof CampanhaDisparoSaida>, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiClient.post<z.infer<typeof CampanhaDisparoSaida>>(`/campanhas/${id}/disparar`, { schema: CampanhaDisparoSaida }),
    onSettled: invalidar,
  })
}

export function useCancelarCampanha() {
  const invalidar = useInvalidar()
  return useMutation<z.infer<typeof CampanhaCancelarSaida>, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiClient.post<z.infer<typeof CampanhaCancelarSaida>>(`/campanhas/${id}/cancelar`, { schema: CampanhaCancelarSaida }),
    onSettled: invalidar,
  })
}
