// Camada de dados do modulo conhecimento: curadoria da base do atendente (documentos versionados,
// golden set e triagem da realimentacao). Estado de servidor via TanStack Query; HTTP pelo api_client.
// Raiz de cache ['conhecimento']: qualquer escrita invalida a raiz (aprovar/arquivar mexe em varias listas).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  AvaliacaoGoldenSaida,
  AvaliacoesGoldenSaida,
  DocumentoSaida,
  DocumentoVersoesSaida,
  DocumentosSaida,
  FeedbackPromovidoSaida,
  FeedbackSaida,
  FeedbacksSaida,
  type AvaliacaoAtualizar,
  type AvaliacaoCriar,
  type DocumentoAtualizar,
  type DocumentoCriar,
  type DocumentoStatus,
  type DocumentoTipo,
  type RagFeedbackStatus,
} from '@/shared/contracts/_generated/conhecimento'

export const RAIZ = 'conhecimento'
const BASE = '/conhecimento'

export type Documento = DocumentoSaida
export type Avaliacao = AvaliacaoGoldenSaida
export type Feedback = FeedbackSaida

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: [RAIZ] })
}

// --- Documentos ---
/** GET /v1/conhecimento/documentos. */
export function useDocumentos(filtro: { status?: DocumentoStatus; tipo?: DocumentoTipo }) {
  return useQuery({
    queryKey: [RAIZ, 'documentos', filtro],
    queryFn: ({ signal }) =>
      apiClient.get<DocumentosSaida>(`${BASE}/documentos`, {
        schema: DocumentosSaida,
        query: { ...filtro, limite: 200 },
        signal,
      }),
    select: (d) => d.itens,
  })
}

/** GET /v1/conhecimento/documentos/:id/versoes (so quando `id` e informado). */
export function useVersoes(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'versoes', id],
    enabled: id !== null,
    queryFn: ({ signal }) =>
      apiClient.get<DocumentoVersoesSaida>(`${BASE}/documentos/${id}/versoes`, {
        schema: DocumentoVersoesSaida,
        signal,
      }),
    select: (d) => d.versoes,
  })
}

/** POST /v1/conhecimento/documentos: cria rascunho. */
export function useCriarDocumento() {
  const qc = useQueryClient()
  return useMutation<Documento, Error, DocumentoCriar>({
    mutationFn: (body) => apiClient.post<Documento>(`${BASE}/documentos`, { body, schema: DocumentoSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** PATCH /v1/conhecimento/documentos/:id: rascunho edita no lugar; aprovado cria nova versao. */
export function useAtualizarDocumento() {
  const qc = useQueryClient()
  return useMutation<Documento, Error, { id: string; body: DocumentoAtualizar }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<Documento>(`${BASE}/documentos/${id}`, { body, schema: DocumentoSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** POST /v1/conhecimento/documentos/:id/aprovar | arquivar. */
export function useMudarStatusDocumento() {
  const qc = useQueryClient()
  return useMutation<Documento, Error, { id: string; acao: 'aprovar' | 'arquivar' }>({
    mutationFn: ({ id, acao }) =>
      apiClient.post<Documento>(`${BASE}/documentos/${id}/${acao}`, { schema: DocumentoSaida }),
    onSuccess: () => invalidar(qc),
  })
}

// --- Golden set ---
/** GET /v1/conhecimento/avaliacao. */
export function useAvaliacoes() {
  return useQuery({
    queryKey: [RAIZ, 'avaliacao'],
    queryFn: ({ signal }) =>
      apiClient.get<AvaliacoesGoldenSaida>(`${BASE}/avaliacao`, {
        schema: AvaliacoesGoldenSaida,
        query: { limite: 200 },
        signal,
      }),
    select: (d) => d.itens,
  })
}

/** POST /v1/conhecimento/avaliacao. */
export function useCriarAvaliacao() {
  const qc = useQueryClient()
  return useMutation<Avaliacao, Error, AvaliacaoCriar>({
    mutationFn: (body) => apiClient.post<Avaliacao>(`${BASE}/avaliacao`, { body, schema: AvaliacaoGoldenSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** PATCH /v1/conhecimento/avaliacao/:id (inclui `ativo` para desligar, sem apagar). */
export function useAtualizarAvaliacao() {
  const qc = useQueryClient()
  return useMutation<Avaliacao, Error, { id: string; body: AvaliacaoAtualizar }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<Avaliacao>(`${BASE}/avaliacao/${id}`, { body, schema: AvaliacaoGoldenSaida }),
    onSuccess: () => invalidar(qc),
  })
}

// --- Realimentacao (feedback) ---
/** GET /v1/conhecimento/feedback. */
export function useFeedback(status?: RagFeedbackStatus) {
  return useQuery({
    queryKey: [RAIZ, 'feedback', status ?? 'todos'],
    queryFn: ({ signal }) =>
      apiClient.get<FeedbacksSaida>(`${BASE}/feedback`, {
        schema: FeedbacksSaida,
        query: { status, limite: 200 },
        signal,
      }),
    select: (d) => d.itens,
  })
}

/** POST /v1/conhecimento/feedback/:id/triar | descartar. */
export function useTriarFeedback() {
  const qc = useQueryClient()
  return useMutation<Feedback, Error, { id: string; acao: 'triar' | 'descartar' }>({
    mutationFn: ({ id, acao }) =>
      apiClient.post<Feedback>(`${BASE}/feedback/${id}/${acao}`, { schema: FeedbackSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** POST /v1/conhecimento/feedback/:id/promover: o dono escreve o documento (rascunho). */
export function usePromoverFeedback() {
  const qc = useQueryClient()
  return useMutation<FeedbackPromovidoSaida, Error, { id: string; body: DocumentoCriar }>({
    mutationFn: ({ id, body }) =>
      apiClient.post<FeedbackPromovidoSaida>(`${BASE}/feedback/${id}/promover`, {
        body,
        schema: FeedbackPromovidoSaida,
      }),
    onSuccess: () => invalidar(qc),
  })
}
