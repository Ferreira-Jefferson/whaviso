// Camada de dados do modulo llm: credencial do provedor do atendente (BYO key) e consumo.
// A chave e WRITE-ONLY: so as mutacoes de ENTRADA carregam `chave`; nenhuma leitura devolve a chave.
// Depois de cada mutacao com chave, o cache de mutacao e limpo (`reset`) para a chave nao ficar em
// `mutation.variables` na memoria do TanStack Query. Raiz de cache ['llm'].
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  CredencialLlmEstado,
  CredencialLlmTesteSaida,
  UsoLlmResumo,
  type CredencialLlmEntrada,
  type CredencialLlmPatch,
  type CredencialLlmTestarEntrada,
} from '@/shared/contracts/_generated/configuracoes_llm'

export const RAIZ = 'llm'
const BASE = '/llm'

export type Estado = CredencialLlmEstado
export type Uso = UsoLlmResumo

/** GET /v1/llm/credencial: so metadado (configurada, ultimos4, provedor, validada_em). */
export function useCredencial() {
  return useQuery({
    queryKey: [RAIZ, 'credencial'],
    queryFn: ({ signal }) =>
      apiClient.get<Estado>(`${BASE}/credencial`, { schema: CredencialLlmEstado, signal }),
  })
}

/** GET /v1/llm/uso: resumo de consumo do mes (custo em centavos). */
export function useUso() {
  return useQuery({
    queryKey: [RAIZ, 'uso'],
    queryFn: ({ signal }) => apiClient.get<Uso>(`${BASE}/uso`, { schema: UsoLlmResumo, signal }),
  })
}

/** PUT /v1/llm/credencial: cadastra ou troca a chave. A api valida no provedor antes de gravar. */
export function useDefinirCredencial() {
  const qc = useQueryClient()
  const m: UseMutationResult<Estado, Error, CredencialLlmEntrada> = useMutation({
    mutationFn: (body: CredencialLlmEntrada) =>
      apiClient.put<Estado>(`${BASE}/credencial`, { body, schema: CredencialLlmEstado }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
    // Limpa as variaveis (com a chave) da memoria assim que a chamada termina.
    onSettled: () => queueMicrotask(() => m.reset()),
  })
  return m
}

/** PATCH /v1/llm/credencial: liga/desliga e/ou troca o modelo, sem reenviar a chave. */
export function useAjustarCredencial() {
  const qc = useQueryClient()
  return useMutation<Estado, Error, CredencialLlmPatch>({
    mutationFn: (body) =>
      apiClient.patch<Estado>(`${BASE}/credencial`, { body, schema: CredencialLlmEstado }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

/** POST /v1/llm/credencial/testar: revalida a chave digitada (nunca a gravada). */
export function useTestarChave() {
  const m: UseMutationResult<CredencialLlmTesteSaida, Error, CredencialLlmTestarEntrada> = useMutation({
    mutationFn: (body: CredencialLlmTestarEntrada) =>
      apiClient.post<CredencialLlmTesteSaida>(`${BASE}/credencial/testar`, {
        body,
        schema: CredencialLlmTesteSaida,
      }),
    onSettled: () => queueMicrotask(() => m.reset()),
  })
  return m
}
