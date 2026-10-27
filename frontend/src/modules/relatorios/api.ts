// Camada de dados dos relatorios (BI de fundo). Raiz de cache ['relatorios']. So leitura.
// Exigem `relatorios:ver` (dono/gerente): sem permissao a api responde 403 (ApiError).
// A loja efetiva vem do header x-loja-id (api_client). Dinheiro em centavos.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  CancelamentosSaida,
  CoortesSaida,
  FormasPagamentoSaida,
  VendasSaida,
  type VendasDimensao,
} from '@/shared/contracts/_generated/relatorios'
import type { Periodo } from './periodo'

export const RAIZ = 'relatorios'

const OPCOES = { placeholderData: keepPreviousData } as const

/** GET /v1/relatorios/vendas?agrupar_por=...: vendas realizadas por dimensao. */
export function useVendas(p: Periodo, agruparPor: VendasDimensao) {
  return useQuery({
    queryKey: [RAIZ, 'vendas', p, agruparPor],
    ...OPCOES,
    queryFn: ({ signal }) =>
      apiClient.get<VendasSaida>('/relatorios/vendas', {
        query: { ...p, agrupar_por: agruparPor, limite: 20 },
        schema: VendasSaida,
        signal,
      }),
  })
}

export function useFormasPagamento(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'formas-pagamento', p],
    ...OPCOES,
    queryFn: ({ signal }) =>
      apiClient.get<FormasPagamentoSaida>('/relatorios/formas-pagamento', { query: { ...p }, schema: FormasPagamentoSaida, signal }),
  })
}

export function useCancelamentos(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'cancelamentos', p],
    ...OPCOES,
    queryFn: ({ signal }) =>
      apiClient.get<CancelamentosSaida>('/relatorios/cancelamentos', { query: { ...p, limite: 20 }, schema: CancelamentosSaida, signal }),
  })
}

export function useCoortes(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'coortes', p],
    ...OPCOES,
    queryFn: ({ signal }) =>
      apiClient.get<CoortesSaida>('/relatorios/coortes', { query: { ...p }, schema: CoortesSaida, signal }),
  })
}

export type { VendasDimensao }
