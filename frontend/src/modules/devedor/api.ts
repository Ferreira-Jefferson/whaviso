// Camada de dados do módulo devedor: chamadas à `api` REST + hooks TanStack Query.
// Estado de servidor 100% via React Query; dados só pelo api_client (nunca supabase.from).
//
// O devedor vê os combinados em que é o devedor pelos MESMOS endpoints do cobrador:
//   - GET /v1/avisos               → o backend filtra por (cobrador_id OR devedor_profile_id)
//   - GET /v1/avisos/:id           → buscarAvisoVisivel também libera o devedor
//   - POST /v1/avisos/:id/marcar-pago-devedor → ação "Já paguei" (programado → informado_pago)
// Não há rota /v1/meus nem /v1/combinados dedicada: a filtragem por vínculo é do backend.
//
// Lacunas conhecidas do backend (degradação graciosa, igual à Fase 4):
//   - GET /v1/avisos/:id/envios  → NÃO existe (CycleTimeline cai em "indisponível")
//   - GET /v1/avisos/:id/eventos → NÃO existe (histórico cai em "indisponível")
//   - opt-out LOGADO             → NÃO existe rota autenticada; só o público
//     POST /v1/acao/:token (precisa do token de ação, que o devedor logado NÃO tem).
//     Modelamos POST /v1/avisos/:id/encerrar-lembretes e degradamos em 404.
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient, ApiError } from '@/shared/api_client'
import {
  avisoSchema,
  envioSchema,
  eventoAvisoSchema,
  statusAviso,
  type Aviso,
  type Envio,
  type EventoAviso,
  type StatusAviso,
} from '@/shared/contracts'

// Envelope paginado de GET /v1/avisos (mesmo do cobrador).
const listaAvisosResposta = z.object({
  itens: z.array(avisoSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type ListaAvisosResposta = z.infer<typeof listaAvisosResposta>

export interface FiltrosMeus {
  status?: StatusAviso
  page?: number
  per_page?: number
}

export const meusKeys = {
  todos: ['meus'] as const,
  lista: (filtros: FiltrosMeus) => ['meus', 'list', filtros] as const,
  detalhe: (id: string) => ['meus', 'detail', id] as const,
  envios: (id: string) => ['meus', 'envios', id] as const,
  eventos: (id: string) => ['meus', 'eventos', id] as const,
}

const enviosResposta = z.array(envioSchema)
const eventosResposta = z.array(eventoAvisoSchema)

/**
 * GET /v1/avisos: combinados em que o usuário aparece (como devedor ou cobrador).
 * O backend filtra por vínculo; aqui mantemos só os em que ele é o DEVEDOR para a
 * área /meus (um aviso onde ele é o cobrador pertence ao painel /app, não aqui).
 * `meuId` = id do perfil do usuário logado (auth.uid == profiles.id).
 */
export function useMeusCombinados(meuId: string | undefined, filtros: FiltrosMeus = {}) {
  return useQuery({
    queryKey: meusKeys.lista(filtros),
    enabled: Boolean(meuId),
    queryFn: ({ signal }) =>
      apiClient.get<ListaAvisosResposta>('/avisos', {
        schema: listaAvisosResposta,
        query: {
          status: filtros.status,
          page: filtros.page,
          per_page: filtros.per_page ?? 100,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
    select: (data) => ({
      ...data,
      itens: data.itens.filter((a) => a.devedor_profile_id === meuId),
    }),
  })
}

/** GET /v1/avisos/:id: detalhe visível ao devedor (inclui Pix, exposto pelo backend). */
export function useMeuCombinado(id: string) {
  return useQuery({
    queryKey: meusKeys.detalhe(id),
    queryFn: ({ signal }) =>
      apiClient.get<Aviso>(`/avisos/${id}`, { schema: avisoSchema, signal }),
  })
}

// Coleção que pode não existir ainda no backend → degrada com aviso, não erro.
export interface ColecaoOpcional<T> {
  itens: T[]
  indisponivel: boolean
}

async function buscarColecaoOpcional<T>(
  path: string,
  schema: z.ZodType<T[]>,
  signal: AbortSignal | undefined,
): Promise<ColecaoOpcional<T>> {
  try {
    const itens = await apiClient.get<T[]>(path, { schema, signal })
    return { itens, indisponivel: false }
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.code === 'rota_inexistente')) {
      return { itens: [], indisponivel: true }
    }
    throw e
  }
}

/**
 * GET /v1/avisos/:id/envios: envios reais do ciclo (fonte da CycleTimeline).
 * O backend NÃO expõe este endpoint hoje → { itens: [], indisponivel: true }.
 */
export function useMeusEnvios(id: string, habilitado = true) {
  return useQuery({
    queryKey: meusKeys.envios(id),
    enabled: habilitado,
    queryFn: ({ signal }) =>
      buscarColecaoOpcional<Envio>(`/avisos/${id}/envios`, enviosResposta, signal),
  })
}

/** GET /v1/avisos/:id/eventos: histórico in-app. Mesma degradação graciosa. */
export function useMeusEventos(id: string) {
  return useQuery({
    queryKey: meusKeys.eventos(id),
    queryFn: ({ signal }) =>
      buscarColecaoOpcional<EventoAviso>(`/avisos/${id}/eventos`, eventosResposta, signal),
  })
}

function invalidarTudo(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: meusKeys.detalhe(id) })
  void qc.invalidateQueries({ queryKey: meusKeys.envios(id) })
  void qc.invalidateQueries({ queryKey: meusKeys.eventos(id) })
  void qc.invalidateQueries({ queryKey: meusKeys.todos })
}

const acaoStatusResposta = z.object({ status: statusAviso })

/**
 * POST /v1/avisos/:id/marcar-pago-devedor: "Já paguei" (programado → informado_pago).
 * Não conclui sozinho: fica em revisão até quem convidou confirmar o recebimento.
 * PESSIMISTA (confirmado por ConfirmDialog). Idempotente no backend: repetir quando
 * já está em revisão/concluído devolve o status atual (200), não erro.
 */
export function useMarcarPago(id: string) {
  const qc = useQueryClient()
  return useMutation<{ status: StatusAviso }, Error, void>({
    mutationFn: () =>
      apiClient.post<{ status: StatusAviso }>(`/avisos/${id}/marcar-pago-devedor`, {
        schema: acaoStatusResposta,
      }),
    onSuccess: () => invalidarTudo(qc, id),
  })
}

/**
 * POST /v1/avisos/:id/encerrar-lembretes: opt-out do DEVEDOR LOGADO.
 *
 * GAP: o backend NÃO tem rota de opt-out autenticada. O único opt-out hoje é o
 * público POST /v1/acao/:token, que exige o token de ação (que o devedor logado
 * não possui). Consumimos a rota REST que faria sentido; em 404 sinalizamos
 * `indisponivel` para a UI degradar com honestidade, sem quebrar.
 */
export interface ResultadoEncerrar {
  indisponivel: boolean
}

export function useEncerrarLembretes(id: string) {
  const qc = useQueryClient()
  return useMutation<ResultadoEncerrar, Error, void>({
    mutationFn: async () => {
      try {
        await apiClient.post(`/avisos/${id}/encerrar-lembretes`, {
          schema: acaoStatusResposta,
        })
        return { indisponivel: false }
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.code === 'rota_inexistente')) {
          return { indisponivel: true }
        }
        throw e
      }
    },
    onSuccess: () => invalidarTudo(qc, id),
  })
}

export type { Aviso, Envio, EventoAviso }
