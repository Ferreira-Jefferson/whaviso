// Camada de dados do modulo plataforma_numeros (console do OPERADOR Whaviso): numeros de WhatsApp
// de QUALQUER loja de QUALQUER conta. A loja alvo vai SEMPRE na rota (`:lojaId` / `:id`), nunca no
// corpo. Rotas de operador: sem x-loja-id (`semLoja: true`). Este modulo NUNCA importa outro modulo
// (coordena so por contrato/HTTP). Raiz de cache ['plataforma_numeros'].
//   GET   /v1/plataforma-usuarios/contas?busca&cursor&limite        contas (para escolher a loja)
//   GET   /v1/plataforma-usuarios/contas/:id                        ficha (lojas da conta)
//   GET   /v1/plataforma-numeros/lojas/:lojaId/numeros              lista numeros da loja
//   POST  /v1/plataforma-numeros/lojas/:lojaId/numeros              conecta numero (Embedded Signup)
//   POST  /v1/plataforma-numeros/lojas/:lojaId/numeros/anexar       anexa WABA existente (sem code)
//   PATCH /v1/plataforma-numeros/numeros/:id/status                 pausar|reativar|remover
//   POST  /v1/plataforma-numeros/numeros/:id/reconectar             rotaciona o token
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  PlataformaContaFicha,
  PlataformaContaPagina,
  type PlataformaSituacaoConta,
} from '@/shared/contracts/_generated/plataforma_usuarios'
import {
  listaNumerosSaida,
  numeroSaida,
  type ListaNumerosSaida,
  type NumeroConectarEntrada,
  type NumeroReconectarEntrada,
  type NumeroSaida,
  type NumeroStatusEntrada,
} from '@/shared/contracts/_generated/numeros_whatsapp'

export const RAIZ = 'plataforma_numeros'

const LIMITE_PAGINA = 20

export interface FiltroContas {
  /** Minimo 2 caracteres (o backend recusa menos); o chamador so passa quando valido. */
  busca?: string
  situacao?: PlataformaSituacaoConta
}

/** Lista paginada de contas por cursor, para o operador escolher a loja alvo. */
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

/** Ficha da conta (traz as lojas com codigo_publico); so busca com um id selecionado. */
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

/** GET /v1/plataforma-numeros/lojas/:lojaId/numeros: numeros da loja alvo (so metadados). */
export function useNumerosLoja(lojaId: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'numeros', lojaId],
    enabled: lojaId != null,
    queryFn: ({ signal }) =>
      apiClient.get<ListaNumerosSaida>(`/plataforma-numeros/lojas/${lojaId}/numeros`, {
        schema: listaNumerosSaida,
        signal,
        semLoja: true,
      }),
  })
}

/** POST /v1/plataforma-numeros/lojas/:lojaId/numeros: conclui o Embedded Signup na loja alvo. */
export function useConectarNumero(lojaId: string) {
  const qc = useQueryClient()
  return useMutation<NumeroSaida, Error, NumeroConectarEntrada>({
    mutationFn: (body) =>
      apiClient.post<NumeroSaida>(`/plataforma-numeros/lojas/${lojaId}/numeros`, {
        body,
        schema: numeroSaida,
        semLoja: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ, 'numeros', lojaId] })
      void qc.invalidateQueries({ queryKey: [RAIZ, 'ficha'] })
    },
  })
}

/** Corpo de "anexar WABA existente" (console): token de system user + ids, sem code. */
export interface NumeroAnexarEntrada {
  waba_id: string
  phone_number_id: string
  access_token: string
}

/**
 * POST /v1/plataforma-numeros/lojas/:lojaId/numeros/anexar: anexa uma WABA que a plataforma JA
 * possui, sem Embedded Signup (nao ha code quando o dono do app roda o fluxo). O operador informa
 * os ids e um access_token de system user com acesso a WABA. O token e segredo: so vai no corpo,
 * nunca volta nem fica guardado no front.
 */
export function useAnexarNumero(lojaId: string) {
  const qc = useQueryClient()
  return useMutation<NumeroSaida, Error, NumeroAnexarEntrada>({
    mutationFn: (body) =>
      apiClient.post<NumeroSaida>(`/plataforma-numeros/lojas/${lojaId}/numeros/anexar`, {
        body,
        schema: numeroSaida,
        semLoja: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ, 'numeros', lojaId] })
      void qc.invalidateQueries({ queryKey: [RAIZ, 'ficha'] })
    },
  })
}

/** POST /v1/plataforma-numeros/numeros/:id/reconectar: novo code para rotacionar o token. */
export function useReconectarNumero(lojaId: string) {
  const qc = useQueryClient()
  return useMutation<NumeroSaida, Error, { id: string } & NumeroReconectarEntrada>({
    mutationFn: ({ id, codigo }) =>
      apiClient.post<NumeroSaida>(`/plataforma-numeros/numeros/${id}/reconectar`, {
        body: { codigo },
        schema: numeroSaida,
        semLoja: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ, 'numeros', lojaId] })
    },
  })
}

/** PATCH /v1/plataforma-numeros/numeros/:id/status: pausar, reativar ou remover o numero. */
export function useMudarStatusNumero(lojaId: string) {
  const qc = useQueryClient()
  return useMutation<NumeroSaida, Error, { id: string } & NumeroStatusEntrada>({
    mutationFn: ({ id, acao }) =>
      apiClient.patch<NumeroSaida>(`/plataforma-numeros/numeros/${id}/status`, {
        body: { acao },
        schema: numeroSaida,
        semLoja: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ, 'numeros', lojaId] })
      void qc.invalidateQueries({ queryKey: [RAIZ, 'ficha'] })
    },
  })
}

export type { NumeroSaida }
