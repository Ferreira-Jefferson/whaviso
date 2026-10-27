// Camada de dados do modulo fluxo: builder do grafo de atendimento (catalogo fechado de nodes,
// fluxos versionados, validar/publicar/ativar). Estado de servidor via TanStack Query; HTTP pelo api_client.
// Raiz de cache ['fluxo']; toda escrita invalida a raiz.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  FluxoCatalogoSaida,
  FluxoSaida,
  FluxoValidacaoSaida,
  FluxoVersoesSaida,
  FluxosSaida,
  type FluxoDto,
  type FluxoGrafo,
  type FluxoNovo,
  type FluxoValidacao,
} from '@/shared/contracts/_generated/fluxo'
import type { z } from 'zod'

export const RAIZ = 'fluxo'
const BASE = '/fluxo'

export type Fluxo = FluxoDto
export type ResumoFluxo = z.infer<typeof FluxosSaida>['itens'][number]
export type ResumoVersao = z.infer<typeof FluxoVersoesSaida>['itens'][number]
export type ItemCatalogo = z.infer<typeof FluxoCatalogoSaida>['nodes'][number]

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: [RAIZ] })
}

/** GET /v1/fluxo/catalogo: tipos de node permitidos, handles e JSON Schema da config. */
export function useCatalogo() {
  return useQuery({
    queryKey: [RAIZ, 'catalogo'],
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof FluxoCatalogoSaida>>(`${BASE}/catalogo`, { schema: FluxoCatalogoSaida, signal }),
    select: (d) => d.nodes,
  })
}

/** GET /v1/fluxo. */
export function useFluxos() {
  return useQuery({
    queryKey: [RAIZ, 'lista'],
    queryFn: ({ signal }) => apiClient.get<z.infer<typeof FluxosSaida>>(BASE, { schema: FluxosSaida, signal }),
    select: (d) => d.itens,
  })
}

/** GET /v1/fluxo/:id (com grafo publicado e rascunho). */
export function useFluxo(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'detalhe', id],
    enabled: id !== null,
    // O editor guarda o grafo local; nao refaz a busca sozinho ao focar a aba.
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => apiClient.get<Fluxo>(`${BASE}/${id}`, { schema: FluxoSaida, signal }),
  })
}

/** GET /v1/fluxo/:id/versoes. */
export function useVersoes(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'versoes', id],
    enabled: id !== null,
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof FluxoVersoesSaida>>(`${BASE}/${id}/versoes`, { schema: FluxoVersoesSaida, signal }),
    select: (d) => d.itens,
  })
}

/** POST /v1/fluxo: cria fluxo (rascunho a partir do padrao quando sem grafo). */
export function useCriarFluxo() {
  const qc = useQueryClient()
  return useMutation<Fluxo, Error, FluxoNovo>({
    mutationFn: (body) => apiClient.post<Fluxo>(BASE, { body, schema: FluxoSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** PUT /v1/fluxo/:id/rascunho: salva o grafo (controle otimista por `atualizado_em_base`). */
export function useSalvarRascunho() {
  const qc = useQueryClient()
  return useMutation<Fluxo, Error, { id: string; grafo: FluxoGrafo; atualizado_em_base?: string }>({
    mutationFn: ({ id, ...body }) => apiClient.put<Fluxo>(`${BASE}/${id}/rascunho`, { body, schema: FluxoSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** POST /v1/fluxo/:id/rascunho/validar (valida o rascunho SALVO). */
export function useValidarRascunho() {
  return useMutation<FluxoValidacao, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiClient.post<FluxoValidacao>(`${BASE}/${id}/rascunho/validar`, { schema: FluxoValidacaoSaida }),
  })
}

/** POST /v1/fluxo/:id/rascunho/publicar. */
export function usePublicarFluxo() {
  const qc = useQueryClient()
  return useMutation<Fluxo, Error, { id: string }>({
    mutationFn: ({ id }) => apiClient.post<Fluxo>(`${BASE}/${id}/rascunho/publicar`, { schema: FluxoSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** POST /v1/fluxo/:id/ativar | desativar (um fluxo ativo por loja; exige versao publicada). */
export function useAtivarFluxo() {
  const qc = useQueryClient()
  return useMutation<Fluxo, Error, { id: string; ativo: boolean }>({
    mutationFn: ({ id, ativo }) =>
      apiClient.post<Fluxo>(`${BASE}/${id}/${ativo ? 'ativar' : 'desativar'}`, { schema: FluxoSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** POST /v1/fluxo/:id/versoes/:versao/restaurar: a versao vira o novo rascunho. */
export function useRestaurarVersao() {
  const qc = useQueryClient()
  return useMutation<Fluxo, Error, { id: string; versao: number }>({
    mutationFn: ({ id, versao }) =>
      apiClient.post<Fluxo>(`${BASE}/${id}/versoes/${versao}/restaurar`, { schema: FluxoSaida }),
    onSuccess: () => invalidar(qc),
  })
}
