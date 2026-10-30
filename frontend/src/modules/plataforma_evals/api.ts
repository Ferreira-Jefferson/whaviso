// Camada de dados do modulo plataforma_evals (Central de Evals, console do OPERADOR): suites e casos
// de teste da LLM e do RAG do atendente, execucoes, baseline e comparacao. Rotas de operador: sem
// x-loja-id (`semLoja`). Este modulo NUNCA importa outro modulo. Raiz de cache ['plataforma_evals'].
//   GET|POST  /v1/plataforma-evals/suites               ; PATCH /suites/:id
//   GET|POST  /v1/plataforma-evals/suites/:id/casos     ; PATCH /casos/:id
//   GET       /v1/plataforma-evals/lojas-alvo
//   POST|GET  /v1/plataforma-evals/execucoes            ; GET /execucoes/:id ; POST /execucoes/:id/cancelar
//   POST      /v1/plataforma-evals/execucoes/comparar   ; POST /execucoes/baseline
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  EvalCaso,
  EvalCasoLista,
  EvalComparacao,
  EvalExecucao,
  EvalExecucaoDetalhe,
  EvalExecucaoLista,
  EvalSuite,
  EvalSuiteLista,
  type EvalBaselineDefinir,
  type EvalCasoAtualizar,
  type EvalCasoCriar,
  type EvalComparar,
  type EvalExecucaoCriar,
  type EvalExecucaoFiltro,
  type EvalSuiteAtualizar,
  type EvalSuiteCriar,
} from '@/shared/contracts/_generated/plataforma_evals'
import { LojaAlvoLista } from './schemas'
import { emAndamento } from './rotulos'

export const RAIZ = 'plataforma_evals'

const POLL_MS = 3000

export function useSuites() {
  return useQuery({
    queryKey: [RAIZ, 'suites'],
    queryFn: ({ signal }) =>
      apiClient.get<EvalSuiteLista>('/plataforma-evals/suites', { schema: EvalSuiteLista, signal, semLoja: true }),
  })
}

export function useCriarSuite() {
  const qc = useQueryClient()
  return useMutation<EvalSuite, Error, EvalSuiteCriar>({
    mutationFn: (body) => apiClient.post<EvalSuite>('/plataforma-evals/suites', { body, schema: EvalSuite, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'suites'] }),
  })
}

export function useAtualizarSuite() {
  const qc = useQueryClient()
  return useMutation<EvalSuite, Error, { id: string; patch: EvalSuiteAtualizar }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<EvalSuite>(`/plataforma-evals/suites/${id}`, { body: patch, schema: EvalSuite, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'suites'] }),
  })
}

export function useCasos(suiteId: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'casos', suiteId],
    enabled: suiteId != null,
    queryFn: ({ signal }) =>
      apiClient.get<EvalCasoLista>(`/plataforma-evals/suites/${suiteId}/casos`, {
        schema: EvalCasoLista,
        signal,
        semLoja: true,
      }),
  })
}

export function useCriarCaso(suiteId: string) {
  const qc = useQueryClient()
  return useMutation<EvalCaso, Error, EvalCasoCriar>({
    mutationFn: (body) =>
      apiClient.post<EvalCaso>(`/plataforma-evals/suites/${suiteId}/casos`, { body, schema: EvalCaso, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'casos', suiteId] }),
  })
}

export function useAtualizarCaso(suiteId: string) {
  const qc = useQueryClient()
  return useMutation<EvalCaso, Error, { id: string; patch: EvalCasoAtualizar }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<EvalCaso>(`/plataforma-evals/casos/${id}`, { body: patch, schema: EvalCaso, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'casos', suiteId] }),
  })
}

export function useLojasAlvo() {
  return useQuery({
    queryKey: [RAIZ, 'lojas-alvo'],
    queryFn: ({ signal }) =>
      apiClient.get<LojaAlvoLista>('/plataforma-evals/lojas-alvo', { schema: LojaAlvoLista, signal, semLoja: true }),
  })
}

/** Historico de execucoes; reconsulta sozinho enquanto alguma estiver na fila ou rodando. */
export function useExecucoes(filtro: EvalExecucaoFiltro = {}) {
  return useQuery({
    queryKey: [RAIZ, 'execucoes', filtro.suiteId ?? '', filtro.modelo ?? '', filtro.status ?? ''],
    queryFn: ({ signal }) =>
      apiClient.get<EvalExecucaoLista>('/plataforma-evals/execucoes', {
        query: { suiteId: filtro.suiteId, modelo: filtro.modelo, status: filtro.status },
        schema: EvalExecucaoLista,
        signal,
        semLoja: true,
      }),
    refetchInterval: (q) => (q.state.data?.some((e) => emAndamento(e.status)) ? POLL_MS : false),
  })
}

/** Detalhe de uma execucao; reconsulta sozinho ate virar um estado final. */
export function useExecucao(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'execucao', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<EvalExecucaoDetalhe>(`/plataforma-evals/execucoes/${id}`, {
        schema: EvalExecucaoDetalhe,
        signal,
        semLoja: true,
      }),
    refetchInterval: (q) => {
      const d = q.state.data
      return d && emAndamento(d.execucao.status) ? POLL_MS : false
    },
  })
}

export function useCriarExecucao() {
  const qc = useQueryClient()
  return useMutation<EvalExecucao, Error, EvalExecucaoCriar>({
    mutationFn: (body) =>
      apiClient.post<EvalExecucao>('/plataforma-evals/execucoes', { body, schema: EvalExecucao, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'execucoes'] }),
  })
}

export function useCancelarExecucao() {
  const qc = useQueryClient()
  return useMutation<EvalExecucao, Error, string>({
    mutationFn: (id) =>
      apiClient.post<EvalExecucao>(`/plataforma-evals/execucoes/${id}/cancelar`, { schema: EvalExecucao, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

export function useDefinirBaseline() {
  const qc = useQueryClient()
  return useMutation<EvalExecucao, Error, EvalBaselineDefinir>({
    mutationFn: (body) =>
      apiClient.post<EvalExecucao>('/plataforma-evals/execucoes/baseline', { body, schema: EvalExecucao, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

/** Comparacao A x B; so busca quando os dois ids estao escolhidos e sao diferentes. */
export function useComparacao(par: EvalComparar | null) {
  return useQuery({
    queryKey: [RAIZ, 'comparacao', par?.execucaoA ?? '', par?.execucaoB ?? ''],
    enabled: par != null && par.execucaoA !== par.execucaoB,
    queryFn: ({ signal }) =>
      apiClient.post<EvalComparacao>('/plataforma-evals/execucoes/comparar', {
        body: par,
        schema: EvalComparacao,
        signal,
        semLoja: true,
      }),
  })
}
