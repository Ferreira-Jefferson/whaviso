// Camada de dados do modulo numeros: numeros de WhatsApp (Meta Cloud API) da loja ativa.
// Estado de servidor via TanStack Query; dados so pelo api_client. Raiz de cache ['numeros'].
// A loja efetiva vem do header x-loja-id (api_client), nunca do corpo (SEC-002).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  listaNumerosSaida,
  numeroSaida,
  type ListaNumerosSaida,
  type NumeroConectarEntrada,
  type NumeroReconectarEntrada,
  type NumeroSaida,
  type NumeroStatusEntrada,
} from '@/shared/contracts/_generated/numeros_whatsapp'

export const RAIZ = 'numeros'

/** GET /v1/numeros: numeros conectados a loja ativa (metadados; sem numero em claro, sem token). */
export function useNumeros() {
  return useQuery({
    queryKey: [RAIZ, 'lista'],
    queryFn: ({ signal }) =>
      apiClient.get<ListaNumerosSaida>('/numeros', { schema: listaNumerosSaida, signal }),
  })
}

/** POST /v1/numeros: conclui o Embedded Signup (code + waba_id + phone_number_id). */
export function useConectarNumero() {
  const qc = useQueryClient()
  return useMutation<NumeroSaida, Error, NumeroConectarEntrada>({
    mutationFn: (body) => apiClient.post<NumeroSaida>('/numeros', { body, schema: numeroSaida }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}

/** POST /v1/numeros/:id/reconectar: novo code para rotacionar o token do numero. */
export function useReconectarNumero() {
  const qc = useQueryClient()
  return useMutation<NumeroSaida, Error, { id: string } & NumeroReconectarEntrada>({
    mutationFn: ({ id, codigo }) =>
      apiClient.post<NumeroSaida>(`/numeros/${id}/reconectar`, { body: { codigo }, schema: numeroSaida }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}

/** PATCH /v1/numeros/:id/status: pausar, reativar ou remover o numero. */
export function useMudarStatusNumero() {
  const qc = useQueryClient()
  return useMutation<NumeroSaida, Error, { id: string } & NumeroStatusEntrada>({
    mutationFn: ({ id, acao }) =>
      apiClient.patch<NumeroSaida>(`/numeros/${id}/status`, { body: { acao }, schema: numeroSaida }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}

export type { NumeroSaida }
