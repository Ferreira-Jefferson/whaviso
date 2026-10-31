// Camada de dados do modulo plataforma_usuarios (console do OPERADOR Whaviso): usuarios (donos de
// restaurante, equipe deles ou equipe interna da Whaviso). Metadado e saude agregada; nunca
// conteudo de loja nem contato (SEC-003). Rotas de operador: sem x-loja-id (`semLoja`). Este
// modulo NUNCA importa outro modulo.
// Raiz de cache ['plataforma_usuarios'].
//   GET   /v1/plataforma-usuarios/contas?busca&situacao&cursor&limite   lista paginada por cursor
//   GET   /v1/plataforma-usuarios/contas/:id                            ficha
//   GET   /v1/plataforma-usuarios/operadores                            equipe (so admin)
//   POST  /v1/plataforma-usuarios/operadores                            vincula por e-mail (admin)
//   POST  /v1/plataforma-usuarios/usuarios                              cadastra usuario (admin)
//   PATCH /v1/plataforma-usuarios/operadores/:id                        papel/ativo (admin)
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  PlataformaContaFicha,
  PlataformaContaPagina,
  type OperadorPatch,
  type PlataformaSituacaoConta,
} from '@/shared/contracts/_generated/plataforma_usuarios'
import {
  ChaveApiCriada,
  ChaveApiDTO,
  ChaveApiLista,
  CredencialLlmResumo,
  NovoUsuarioSaida,
  OperadorDTO,
  OperadorListaSaida,
  PlanosResumoLista,
  PoolLlmResumoLista,
  type NovaChaveApi,
  type NovoUsuario,
  type OperadorConvite,
  type PlanoResumo,
  type PoolLlmResumo,
} from './schemas'

export const RAIZ = 'plataforma_usuarios'

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
      apiClient.get<PlataformaContaPagina>('/plataforma-usuarios/contas', {
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
      apiClient.get<PlataformaContaFicha>(`/plataforma-usuarios/contas/${id}`, {
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
      apiClient.get<OperadorListaSaida>('/plataforma-usuarios/operadores', {
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
      apiClient.post<OperadorDTO>('/plataforma-usuarios/operadores', { body, schema: OperadorDTO, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'operadores'] }),
  })
}

export function useAtualizarOperador() {
  const qc = useQueryClient()
  return useMutation<OperadorDTO, Error, { id: string; patch: OperadorPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<OperadorDTO>(`/plataforma-usuarios/operadores/${id}`, {
        body: patch,
        schema: OperadorDTO,
        semLoja: true,
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'operadores'] }),
  })
}

/**
 * Cadastra um usuario: cria conta nova (com plano opcional) ou vincula a uma loja ja cadastrada
 * (por codigo publico). `ativo` aprova o acesso de login na hora ou deixa pendente. So admin.
 */
export function useCriarUsuario() {
  const qc = useQueryClient()
  return useMutation<NovoUsuarioSaida, Error, NovoUsuario>({
    mutationFn: (body) =>
      apiClient.post<NovoUsuarioSaida>('/plataforma-usuarios/usuarios', { body, schema: NovoUsuarioSaida, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'contas'] }),
  })
}

/** Catalogo de planos (modulo plataforma_cobranca), so os ativos, pro seletor de "nova conta". */
export function usePlanosAtivos() {
  return useQuery({
    queryKey: [RAIZ, 'planos_ativos'],
    queryFn: ({ signal }) =>
      apiClient.get<PlanoResumo[]>('/plataforma-cobranca/planos', { schema: PlanosResumoLista, signal, semLoja: true }),
    select: (planos) => planos.filter((p) => p.ativo),
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

// Pool de chaves de LLM (modulo configuracoes_llm): so as ATIVAS entram no seletor de atribuicao.
//   GET /v1/llm/pool                              lista (admin)
//   PUT /v1/llm/pool/atribuicoes/:lojaId           atribui uma chave do pool a uma loja
export function usePoolLlmAtivo() {
  return useQuery({
    queryKey: [RAIZ, 'pool_llm'],
    queryFn: ({ signal }) =>
      apiClient.get<PoolLlmResumo[]>('/llm/pool', { schema: PoolLlmResumoLista, signal, semLoja: true }),
    select: (itens) => itens.filter((p) => p.ativo),
  })
}

export function useAtribuirPoolLlm(lojaId: string) {
  const qc = useQueryClient()
  return useMutation<CredencialLlmResumo, Error, string>({
    mutationFn: (poolChaveId) =>
      apiClient.put<CredencialLlmResumo>(`/llm/pool/atribuicoes/${lojaId}`, {
        body: { pool_chave_id: poolChaveId },
        schema: CredencialLlmResumo,
        semLoja: true,
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'ficha'] }),
  })
}
