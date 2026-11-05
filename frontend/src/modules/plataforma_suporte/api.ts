// Camada de dados do modulo plataforma_suporte (console do OPERADOR Whaviso): fila de chamados de
// TODAS as lojas, respostas, e o visualizador READ-ONLY de conversas da loja do chamado (sob
// consentimento ativo). Rotas de operador: sem x-loja-id (`semLoja: true`). O visualizador de
// conversas usa os endpoints de conversas EXISTENTES com o override de loja por chamada (`lojaId`):
// o backend libera so leitura quando ha acesso assistido ativo. Este modulo NUNCA importa outro
// modulo (coordena so por contrato/HTTP). Raiz de cache ['plataforma_suporte'].
//   GET  /v1/plataforma-suporte/chamados?status&cursor&limite   fila paginada por cursor
//   GET  /v1/plataforma-suporte/chamados/:id                    ficha do chamado
//   POST /v1/plataforma-suporte/chamados/:id/mensagens          responde ao chamado
//   GET  /v1/plataforma-suporte/lojas/:lojaId/acessos           acessos (consentimento) da loja
//   GET  /v1/conversas            (lojaId override)             lista read-only das conversas da loja
//   GET  /v1/conversas/:id        (lojaId override)             detalhe read-only
//   GET  /v1/conversas/:id/mensagens (lojaId override)          mensagens read-only
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  ChamadoFicha,
  ChamadoMensagem,
  ChamadoPagina,
  ListaAcessos,
  type NovaMensagem,
  type StatusChamado,
} from '@/shared/contracts/_generated/suporte'
import {
  ConversaDetalheSaida,
  ConversaListaSaida,
  MensagensSaida,
  type ConversaListaItem,
  type ConversaDetalheSaida as ConversaDetalheTipo,
  type MensagemSaida,
} from '@/shared/contracts/_generated/conversas'
import type { StatusConversa } from '@/shared/contracts/_generated/enums'

export const RAIZ = 'plataforma_suporte'

const LIMITE_FILA = 20
const LIMITE_CONVERSAS = 50
const LIMITE_MENSAGENS = 50

/** GET /v1/plataforma-suporte/chamados: fila de todas as lojas, filtrada por status, por cursor. */
export function useFilaChamados(status?: StatusChamado) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'fila', status ?? ''],
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<ChamadoPagina>('/plataforma-suporte/chamados', {
        query: { cursor: pageParam, limite: LIMITE_FILA, status },
        schema: ChamadoPagina,
        signal,
        semLoja: true,
      }),
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

/** GET /v1/plataforma-suporte/chamados/:id: ficha com o fio de mensagens. */
export function useChamado(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'chamado', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<ChamadoFicha>(`/plataforma-suporte/chamados/${id}`, {
        schema: ChamadoFicha,
        signal,
        semLoja: true,
      }),
  })
}

/** POST /v1/plataforma-suporte/chamados/:id/mensagens: responde ao chamado (como operador). */
export function useResponder(chamadoId: string) {
  const qc = useQueryClient()
  return useMutation<ChamadoMensagem, Error, NovaMensagem>({
    mutationFn: (body) =>
      apiClient.post<ChamadoMensagem>(`/plataforma-suporte/chamados/${chamadoId}/mensagens`, {
        body,
        schema: ChamadoMensagem,
        semLoja: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ, 'chamado', chamadoId] })
      void qc.invalidateQueries({ queryKey: [RAIZ, 'fila'] })
    },
  })
}

/** GET /v1/plataforma-suporte/lojas/:lojaId/acessos: consentimento da loja (so leitura). */
export function useAcessosLoja(lojaId: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'acessos', lojaId],
    enabled: lojaId != null,
    queryFn: ({ signal }) =>
      apiClient.get<ListaAcessos>(`/plataforma-suporte/lojas/${lojaId}/acessos`, {
        schema: ListaAcessos,
        signal,
        semLoja: true,
      }),
  })
}

// ---------------------------------------------------------------- visualizador read-only
// As conversas usam os endpoints de conversas existentes com o override de loja por chamada
// (`lojaId`): o backend so devolve leitura quando ha acesso assistido ativo para aquela loja.
// Cache separado por loja para nunca cruzar com o ['conversas'] do painel da propria loja.

export type ConversaLista = ConversaListaItem
export type ConversaDetalhe = ConversaDetalheTipo
export type Mensagem = MensagemSaida

type ListaSaida = z.infer<typeof ConversaListaSaida>
type DetalheSaida = z.infer<typeof ConversaDetalheSaida>
type MensagensSaidaT = z.infer<typeof MensagensSaida>

export interface FiltrosConversas {
  status?: StatusConversa
  busca?: string
}

/** GET /v1/conversas (loja alvo via override): lista read-only das conversas da loja do chamado. */
export function useConversasLoja(lojaId: string, filtros: FiltrosConversas) {
  return useQuery({
    queryKey: [RAIZ, 'conversas', lojaId, filtros.status ?? '', filtros.busca ?? ''],
    queryFn: ({ signal }) =>
      apiClient.get<ListaSaida>('/conversas', {
        query: { status: filtros.status, busca: filtros.busca, limite: LIMITE_CONVERSAS },
        schema: ConversaListaSaida,
        signal,
        lojaId,
      }),
  })
}

/** GET /v1/conversas/:id (loja alvo via override): detalhe read-only. */
export function useConversaLoja(lojaId: string, conversaId: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'conversa', lojaId, conversaId],
    enabled: conversaId != null,
    queryFn: ({ signal }) =>
      apiClient.get<DetalheSaida>(`/conversas/${conversaId}`, {
        schema: ConversaDetalheSaida,
        signal,
        lojaId,
      }),
  })
}

/** GET /v1/conversas/:id/mensagens (loja alvo via override): historico read-only paginado. */
export function useMensagensLoja(lojaId: string, conversaId: string | null) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'mensagens', lojaId, conversaId],
    enabled: conversaId != null,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<MensagensSaidaT>(`/conversas/${conversaId}/mensagens`, {
        query: { limite: LIMITE_MENSAGENS, cursor: pageParam },
        schema: MensagensSaida,
        signal,
        lojaId,
      }),
    getNextPageParam: (ultima) => ultima.proximo_cursor ?? undefined,
  })
}

/** Achata as paginas na ordem de leitura: mais antigas primeiro, mais recentes por ultimo. */
export function mensagensEmOrdem(paginas: ReadonlyArray<MensagensSaidaT> | undefined): Mensagem[] {
  if (!paginas) return []
  return [...paginas].reverse().flatMap((p) => p.itens)
}
