// Camada de dados do painel de custos externos da loja (LLM, WhatsApp, mapas, fiscal).
// Raiz de cache ['custos']. So leitura. Loja efetiva = header x-loja-id (api_client).
// So da loja: as rotas de operador (/custos/plataforma/*) NAO sao usadas aqui.
// Dinheiro em centavos; periodo maximo de 92 dias.
import type { z } from 'zod'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  CustosEventosSaida,
  CustosResumoLojaSaida,
  type CategoriaCusto,
  type CustosResumoLoja,
} from '@/shared/contracts/_generated/custos'
import type { Periodo } from './periodo'

export const RAIZ = 'custos'

/** GET /v1/custos/resumo: total, por categoria/origem/dia, pico e media diaria. */
export function useResumoCustos(p: Periodo) {
  return useQuery({
    queryKey: [RAIZ, 'resumo', p],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiClient.get<CustosResumoLoja>('/custos/resumo', { query: { ...p }, schema: CustosResumoLojaSaida, signal }),
  })
}

/** GET /v1/custos/eventos: razao de eventos, paginado por cursor ("carregar mais"). */
export function useEventosCusto(p: Periodo, categoria: CategoriaCusto | null) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'eventos', p, categoria],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) =>
      apiClient.get<z.infer<typeof CustosEventosSaida>>('/custos/eventos', {
        query: { ...p, categoria: categoria ?? undefined, cursor: pageParam ?? undefined, limite: 20 },
        schema: CustosEventosSaida,
        signal,
      }),
    getNextPageParam: (ultima) => ultima.proximoCursor,
  })
}

export type { CategoriaCusto, CustosResumoLoja }
