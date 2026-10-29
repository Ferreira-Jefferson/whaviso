// Camada de dados do dashboard (read-model). Raiz de cache ['dashboard']. So leitura.
// A loja efetiva vem do header x-loja-id (api_client). Dinheiro em centavos; campos
// financeiros chegam null para quem nao tem `relatorios:ver`.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { DashboardGeral } from '@/shared/contracts/_generated/dashboard'
import type { Periodo } from './periodo'

export const RAIZ = 'dashboard'

// Troca de periodo mantem o dado anterior em tela (sem piscar). Sem polling: o SSE
// (pedido.atualizado) ja invalida a raiz 'dashboard'.
const OPCOES = { placeholderData: keepPreviousData } as const

// Tudo do dashboard numa chamada (/dashboard/geral): resumo, series, top itens e atendimento. O
// servidor resolve os cinco read-models em paralelo, entao a pagina paga uma ida ao banco (e uma
// resolucao de escopo) em vez de cinco. O limite de top itens usa o padrao do servidor (10).
export function useDashboardGeral(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'geral', p],
    ...OPCOES,
    queryFn: ({ signal }) => apiClient.get<DashboardGeral>('/dashboard/geral', { query: { ...p }, schema: DashboardGeral, signal }),
  })
}
