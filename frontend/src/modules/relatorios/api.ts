// Camada de dados dos relatorios (BI de fundo). Raiz de cache ['relatorios']. So leitura.
// Exigem `relatorios:ver` (dono/gerente): sem permissao a api responde 403 (ApiError).
// A loja efetiva vem do header x-loja-id (api_client). Dinheiro em centavos.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  CancelamentosSaida,
  CoortesSaida,
  DimensoesSaida,
  FormasPagamentoSaida,
  SalaoSaida,
  VendasSaida,
} from '@/shared/contracts/_generated/relatorios'
import type { Periodo } from './periodo'

export const RAIZ = 'relatorios'

const OPCOES = { placeholderData: keepPreviousData } as const

/** Um filtro do montador: mantem linhas cuja `dimensao` casa com algum dos `valores`. */
export interface FiltroVendas {
  dimensao: string
  valores: string[]
}
export interface ConsultaVendas {
  agrupar_por: string
  filtros: FiltroVendas[]
}

/** POST /v1/relatorios/vendas: montador flexivel (agrupamento + filtros combinados). */
export function useVendas(p: Periodo, consulta: ConsultaVendas) {
  return useQuery({
    queryKey: [RAIZ, 'vendas', p, consulta],
    ...OPCOES,
    queryFn: ({ signal }) =>
      apiClient.post<VendasSaida>('/relatorios/vendas', {
        body: { ...p, agrupar_por: consulta.agrupar_por, filtros: consulta.filtros },
        schema: VendasSaida,
        signal,
      }),
  })
}

/** GET /v1/relatorios/dimensoes: catalogo de dimensoes da loja (fixas + grupos de opcao). */
export function useDimensoes() {
  return useQuery({
    queryKey: [RAIZ, 'dimensoes'],
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      apiClient.get<DimensoesSaida>('/relatorios/dimensoes', { schema: DimensoesSaida, signal }),
  })
}

/** GET /v1/relatorios/salao: vendas do salao por mesa (fora do montador). */
export function useSalao(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'salao', p],
    ...OPCOES,
    queryFn: ({ signal }) =>
      apiClient.get<SalaoSaida>('/relatorios/salao', { query: { ...p }, schema: SalaoSaida, signal }),
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
