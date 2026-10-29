// Camada de dados do dashboard (read-model). Raiz de cache ['dashboard']. So leitura.
// A loja efetiva vem do header x-loja-id (api_client). Dinheiro em centavos; campos
// financeiros chegam null para quem nao tem `relatorios:ver`.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  AtendimentoSaude,
  DashboardResumo,
  SeriePorDia,
  SeriePorHora,
  TopItensSaida,
} from '@/shared/contracts/_generated/dashboard'
import type { Periodo } from './periodo'

export const RAIZ = 'dashboard'

// Troca de periodo mantem o dado anterior em tela (sem piscar). Sem polling: o SSE
// (pedido.atualizado) ja invalida a raiz 'dashboard'.
const OPCOES = { placeholderData: keepPreviousData } as const

export function useResumo(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'resumo', p],
    ...OPCOES,
    queryFn: ({ signal }) => apiClient.get<DashboardResumo>('/dashboard/resumo', { query: { ...p }, schema: DashboardResumo, signal }),
  })
}

export function useSerieDiaria(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'serie-diaria', p],
    ...OPCOES,
    queryFn: ({ signal }) => apiClient.get<SeriePorDia>('/dashboard/serie-diaria', { query: { ...p }, schema: SeriePorDia, signal }),
  })
}

export function useSerieHoraria(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'por-hora', p],
    ...OPCOES,
    queryFn: ({ signal }) => apiClient.get<SeriePorHora>('/dashboard/por-hora', { query: { ...p }, schema: SeriePorHora, signal }),
  })
}

export function useTopItens(p: Periodo, limite = 10) {
  return useQuery({
    queryKey: [RAIZ, 'top-itens', p, limite],
    ...OPCOES,
    queryFn: ({ signal }) =>
      apiClient.get<TopItensSaida>('/dashboard/top-itens', { query: { ...p, limite }, schema: TopItensSaida, signal }),
  })
}

export function useAtendimento(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'atendimento', p],
    ...OPCOES,
    queryFn: ({ signal }) => apiClient.get<AtendimentoSaude>('/dashboard/atendimento', { query: { ...p }, schema: AtendimentoSaude, signal }),
  })
}
