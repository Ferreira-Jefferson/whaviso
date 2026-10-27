// Camada de dados do atendimento. Raiz de cache ['conversas'] (invalidada pelo realtime:
// MAPA_INVALIDACAO liga conversa.mensagem e conversa.handoff a esta raiz).
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  ConversaDetalheSaida,
  ConversaEncerradaSaida,
  ConversaListaSaida,
  MensagemEnviadaSaida,
  MensagensSaida,
} from '@/shared/contracts/_generated/conversas'
import type { StatusConversa } from '@/shared/contracts/_generated/enums'

// O contrato gerado exporta os schemas (valores); os tipos saem por inferencia aqui.
export type ConversaLista = z.infer<typeof ConversaListaSaida>
type ConversaDetalhe = z.infer<typeof ConversaDetalheSaida>
type Mensagens = z.infer<typeof MensagensSaida>
type MensagemEnviada = z.infer<typeof MensagemEnviadaSaida>
type ConversaEncerrada = z.infer<typeof ConversaEncerradaSaida>

export const RAIZ = 'conversas'

const LIMITE_LISTA = 50
const LIMITE_MENSAGENS = 50

export interface FiltrosConversas {
  status?: StatusConversa
  busca?: string
}

/** GET /v1/conversas: lista da loja ativa, filtrada por status. */
export function useConversas(filtros: FiltrosConversas) {
  return useQuery({
    queryKey: [RAIZ, 'lista', filtros],
    queryFn: ({ signal }) =>
      apiClient.get<ConversaLista>('/conversas', {
        query: { status: filtros.status, busca: filtros.busca, limite: LIMITE_LISTA },
        schema: ConversaListaSaida,
        signal,
      }),
  })
}

/** GET /v1/conversas/:id: detalhe (status, janela de 24h, numero, pedido ligado). */
export function useConversa(conversaId: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'detalhe', conversaId],
    enabled: conversaId != null,
    queryFn: ({ signal }) =>
      apiClient.get<ConversaDetalhe>(`/conversas/${conversaId}`, {
        schema: ConversaDetalheSaida,
        signal,
      }),
  })
}

/**
 * GET /v1/conversas/:id/mensagens: historico paginado para tras. Cada pagina vem em ordem
 * cronologica; o cursor aponta para a mensagem mais antiga. Para renderizar de cima (antigas)
 * para baixo (recentes), inverta a ORDEM das paginas (ver `mensagensEmOrdem`).
 */
export function useMensagens(conversaId: string | null) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'mensagens', conversaId],
    enabled: conversaId != null,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<Mensagens>(`/conversas/${conversaId}/mensagens`, {
        query: { limite: LIMITE_MENSAGENS, cursor: pageParam },
        schema: MensagensSaida,
        signal,
      }),
    getNextPageParam: (ultima) => ultima.proximo_cursor ?? undefined,
  })
}

/** Achata as paginas na ordem de leitura: mais antigas primeiro, mais recentes por ultimo. */
export function mensagensEmOrdem(paginas: ReadonlyArray<Mensagens> | undefined) {
  if (!paginas) return []
  return [...paginas].reverse().flatMap((p) => p.itens)
}

/** POST /v1/conversas/:id/mensagens: responde como humano (so com a conversa em 'humano'). */
export function useEnviarMensagem(conversaId: string) {
  const qc = useQueryClient()
  return useMutation<MensagemEnviada, Error, string>({
    mutationFn: (texto) =>
      apiClient.post<MensagemEnviada>(`/conversas/${conversaId}/mensagens`, {
        body: { texto },
        schema: MensagemEnviadaSaida,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}

/** POST /v1/conversas/:id/encerrar: encerra o atendimento (qualquer estado nao encerrado). */
export function useEncerrar() {
  const qc = useQueryClient()
  return useMutation<ConversaEncerrada, Error, string>({
    mutationFn: (conversaId) =>
      apiClient.post<ConversaEncerrada>(`/conversas/${conversaId}/encerrar`, {
        body: {},
        schema: ConversaEncerradaSaida,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}
