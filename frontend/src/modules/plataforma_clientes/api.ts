// Camada de dados do modulo plataforma_clientes (console do OPERADOR Whaviso): restaurantes como
// clientes. Metadado e saude agregada; nunca conteudo de loja nem contato (SEC-003). Rotas de
// operador: sem x-loja-id (`semLoja`). Este modulo NUNCA importa outro modulo.
// Raiz de cache ['plataforma_clientes'].
//   GET   /v1/plataforma-clientes/contas?busca&situacao&cursor&limite   lista paginada por cursor
//   GET   /v1/plataforma-clientes/contas/:id                            ficha
//   GET   /v1/plataforma-clientes/operadores                            equipe (so admin)
//   POST  /v1/plataforma-clientes/operadores                            vincula por e-mail (admin)
//   POST  /v1/plataforma-clientes/contas                                provisiona cliente (admin)
//   PATCH /v1/plataforma-clientes/operadores/:id                        papel/ativo (admin)
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  PlataformaContaFicha,
  PlataformaContaPagina,
  type OperadorPatch,
  type PlataformaSituacaoConta,
} from '@/shared/contracts/_generated/plataforma_clientes'
import {
  ChaveApiCriada,
  ChaveApiDTO,
  ChaveApiLista,
  NovoClienteSaida,
  OperadorDTO,
  OperadorListaSaida,
  type NovaChaveApi,
  type NovoCliente,
  type OperadorConvite,
} from './schemas'

export const RAIZ = 'plataforma_clientes'

export interface FiltroContas {
  /** Minimo 2 caracteres (o backend recusa menos); o chamador so passa quando valido. */
  busca?: string
  situacao?: PlataformaSituacaoConta
}

const LIMITE_PAGINA = 20

export function useContas(filtro: FiltroContas) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'contas', filtro.busca ?? '', filtro.situacao ?? ''],
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<PlataformaContaPagina>('/plataforma-clientes/contas', {
        query: { cursor: pageParam, limite: LIMITE_PAGINA, busca: filtro.busca, situacao: filtro.situacao },
        schema: PlataformaContaPagina,
        signal,
        semLoja: true,
      }),
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

/** Ficha da conta; so busca com um id selecionado. */
export function useFichaConta(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'ficha', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<PlataformaContaFicha>(`/plataforma-clientes/contas/${id}`, {
        schema: PlataformaContaFicha,
        signal,
        semLoja: true,
      }),
  })
}

export function useOperadores() {
  return useQuery({
    queryKey: [RAIZ, 'operadores'],
    queryFn: ({ signal }) =>
      apiClient.get<OperadorListaSaida>('/plataforma-clientes/operadores', {
        schema: OperadorListaSaida,
        signal,
        semLoja: true,
      }),
  })
}

export function useConvidarOperador() {
  const qc = useQueryClient()
  return useMutation<OperadorDTO, Error, OperadorConvite>({
    mutationFn: (body) =>
      apiClient.post<OperadorDTO>('/plataforma-clientes/operadores', { body, schema: OperadorDTO, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'operadores'] }),
  })
}

export function useAtualizarOperador() {
  const qc = useQueryClient()
  return useMutation<OperadorDTO, Error, { id: string; patch: OperadorPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<OperadorDTO>(`/plataforma-clientes/operadores/${id}`, {
        body: patch,
        schema: OperadorDTO,
        semLoja: true,
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'operadores'] }),
  })
}

/** Provisiona restaurante cliente: conta + primeira loja + dono (por e-mail). So admin. */
export function useProvisionarCliente() {
  const qc = useQueryClient()
  return useMutation<NovoClienteSaida, Error, NovoCliente>({
    mutationFn: (body) =>
      apiClient.post<NovoClienteSaida>('/plataforma-clientes/contas', { body, schema: NovoClienteSaida, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'contas'] }),
  })
}

// Chaves de API da conta (so admin; o corpo nunca leva loja_id/conta_id: a conta vai na rota).
//   GET  /v1/chaves-api/contas/:contaId/chaves                lista (mascarada)
//   POST /v1/chaves-api/contas/:contaId/chaves                cria (valor completo UMA vez)
//   POST /v1/chaves-api/contas/:contaId/chaves/:id/revogar    revoga (soft)
export function useChavesApi(contaId: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'chaves', contaId],
    enabled: contaId != null,
    queryFn: ({ signal }) =>
      apiClient.get<ChaveApiLista>(`/chaves-api/contas/${contaId}/chaves`, {
        schema: ChaveApiLista,
        signal,
        semLoja: true,
      }),
  })
}

export function useCriarChaveApi(contaId: string) {
  const qc = useQueryClient()
  return useMutation<ChaveApiCriada, Error, NovaChaveApi>({
    mutationFn: (body) =>
      apiClient.post<ChaveApiCriada>(`/chaves-api/contas/${contaId}/chaves`, {
        body,
        schema: ChaveApiCriada,
        semLoja: true,
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'chaves', contaId] }),
  })
}

/** "Excluir" na UI; por baixo e revogar (a linha continua, com a situacao revogada). */
export function useRevogarChaveApi(contaId: string) {
  const qc = useQueryClient()
  return useMutation<ChaveApiDTO, Error, string>({
    mutationFn: (id) =>
      apiClient.post<ChaveApiDTO>(`/chaves-api/contas/${contaId}/chaves/${id}/revogar`, {
        schema: ChaveApiDTO,
        semLoja: true,
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'chaves', contaId] }),
  })
}
