// Camada de dados do modulo avaliacoes: notas e comentarios do consumidor sobre pedidos entregues.
// Somente leitura no painel (o registro vem por endpoint interno). Raiz de cache ['avaliacoes'].
//   GET /v1/avaliacoes?nota&cursor&limite   lista por cursor
//   GET /v1/avaliacoes/resumo               total, media, distribuicao 1..5
// O comentario e texto livre do consumidor: nunca vai para log.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import { AvaliacoesResumoSaida, AvaliacoesSaida } from '@/shared/contracts/_generated/avaliacoes'

export const RAIZ = 'avaliacoes'

export type Avaliacao = z.infer<typeof AvaliacoesSaida>['itens'][number]
export type ResumoAvaliacoes = z.infer<typeof AvaliacoesResumoSaida>

const LIMITE = 20

export function useAvaliacoes(nota: number | null) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'lista', nota],
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<z.infer<typeof AvaliacoesSaida>>('/avaliacoes', {
        query: { nota: nota ?? undefined, cursor: pageParam || undefined, limite: LIMITE },
        schema: AvaliacoesSaida,
        signal,
      }),
    initialPageParam: '' as string,
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

export function useResumoAvaliacoes() {
  return useQuery({
    queryKey: [RAIZ, 'resumo'],
    queryFn: ({ signal }) =>
      apiClient.get<ResumoAvaliacoes>('/avaliacoes/resumo', { schema: AvaliacoesResumoSaida, signal }),
  })
}
