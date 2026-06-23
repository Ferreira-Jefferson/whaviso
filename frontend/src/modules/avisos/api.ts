// Camada de dados do módulo avisos: chamadas à `api` REST + hooks TanStack Query.
// Estado de servidor 100% via React Query; dados só pelo api_client (nunca supabase.from).
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { apiClient, ApiError } from '@/shared/api_client'
import {
  avisoSchema,
  criarAvisoResposta,
  envioSchema,
  eventoAvisoSchema,
  statusAviso,
  type Aviso,
  type AtivarAvisoBody,
  type CriarAvisoBody,
  type CriarAvisoResposta,
  type DirecaoAviso,
  type EditarAvisoBody,
  type Envio,
  type EventoAviso,
  type PapelAviso,
  type StatusAviso,
} from '@/shared/contracts'
import { z } from 'zod'

// A listagem do backend é um envelope paginado (não um array nu):
// { itens: Aviso[], total, page, per_page }.
const listaAvisosResposta = z.object({
  itens: z.array(avisoSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type ListaAvisosResposta = z.infer<typeof listaAvisosResposta>

export interface FiltrosLista {
  status?: StatusAviso
  direcao?: DirecaoAviso
  /** H9.1: papel do usuário (cobre o invertido), não a direção. */
  papel?: PapelAviso
  /** H9.3/H9.8: faixa decidida no servidor (ativos/agenda/historico). */
  grupo?: 'ativos' | 'agenda' | 'historico'
  /** H9.3: busca por nome da outra ponta OU motivo (server-side). */
  busca?: string
  ordenar?: 'data_combinada' | 'criado_em'
  dir?: 'asc' | 'desc'
  page?: number
  per_page?: number
}

export const avisosKeys = {
  todos: ['avisos'] as const,
  lista: (filtros: FiltrosLista) => ['avisos', 'list', filtros] as const,
  detalhe: (id: string) => ['avisos', 'detail', id] as const,
  envios: (id: string) => ['avisos', 'envios', id] as const,
  eventos: (id: string) => ['avisos', 'eventos', id] as const,
}

// Prefixo das queries do painel financeiro. Invalidado após mutações que mudam
// totais. NÃO importamos o módulo painel (fronteira do lint): usamos a chave.
const PAINEL_PREFIXO = ['painel'] as const

const enviosResposta = z.array(envioSchema)
const eventosResposta = z.array(eventoAvisoSchema)

/** GET /v1/avisos: lista paginada do cobrador (filtros por status/direção). */
export function useAvisos(filtros: FiltrosLista) {
  return useQuery({
    queryKey: avisosKeys.lista(filtros),
    queryFn: ({ signal }) =>
      apiClient.get<ListaAvisosResposta>('/avisos', {
        schema: listaAvisosResposta,
        query: {
          status: filtros.status,
          direcao: filtros.direcao,
          papel: filtros.papel,
          grupo: filtros.grupo,
          busca: filtros.busca,
          ordenar: filtros.ordenar,
          dir: filtros.dir,
          page: filtros.page,
          per_page: filtros.per_page,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

/** POST /v1/avisos: cria um aviso; resposta traz { aviso, link_aceite }. */
export function useCriarAviso() {
  const qc = useQueryClient()
  return useMutation<CriarAvisoResposta, Error, CriarAvisoBody>({
    mutationFn: (body) =>
      apiClient.post<CriarAvisoResposta>('/avisos', {
        body,
        schema: criarAvisoResposta,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: avisosKeys.todos })
    },
  })
}

/** GET /v1/avisos/:id: detalhe do aviso (somente o aviso; sem envios/eventos). */
export function useAviso(id: string) {
  return useQuery({
    queryKey: avisosKeys.detalhe(id),
    queryFn: ({ signal }) =>
      apiClient.get<Aviso>(`/avisos/${id}`, { schema: avisoSchema, signal }),
  })
}

// Resultado de um fetch de coleção que pode não existir ainda no backend.
// `indisponivel` = endpoint ausente (404): a UI degrada com aviso honesto,
// em vez de tratar como erro. (Backend ainda não expõe envios/eventos por aviso.)
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
 * O backend atual NÃO expõe este endpoint: nesse caso retornamos
 * { itens: [], indisponivel: true } e a UI mostra um aviso, sem quebrar.
 */
export function useAvisoEnvios(id: string, habilitado = true) {
  return useQuery({
    queryKey: avisosKeys.envios(id),
    enabled: habilitado,
    queryFn: ({ signal }) =>
      buscarColecaoOpcional<Envio>(`/avisos/${id}/envios`, enviosResposta, signal),
  })
}

/**
 * GET /v1/avisos/:id/eventos: eventos (notificações in-app, risco nº 10).
 * Mesma degradação graciosa do useAvisoEnvios quando o endpoint não existe.
 */
export function useAvisoEventos(id: string) {
  return useQuery({
    queryKey: avisosKeys.eventos(id),
    queryFn: ({ signal }) =>
      buscarColecaoOpcional<EventoAviso>(`/avisos/${id}/eventos`, eventosResposta, signal),
  })
}

/** Invalida detalhe + envios + eventos + lista + resumo após uma ação. */
function invalidarTudo(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: avisosKeys.detalhe(id) })
  void qc.invalidateQueries({ queryKey: avisosKeys.envios(id) })
  void qc.invalidateQueries({ queryKey: avisosKeys.eventos(id) })
  void qc.invalidateQueries({ queryKey: avisosKeys.todos })
  void qc.invalidateQueries({ queryKey: PAINEL_PREFIXO })
}

// Resposta dos endpoints de recebimento: { status }.
const recebimentoResposta = z.object({ status: statusAviso })

/**
 * POST /v1/avisos/:id/confirmar-recebimento: OTIMISTA (reversão trivial via
 * desmarcar). Atualiza o detalhe localmente para 'pago'; reverte no erro.
 */
export function useConfirmarRecebimento(id: string) {
  const qc = useQueryClient()
  return useMutation<{ status: StatusAviso }, Error, void>({
    mutationFn: () =>
      apiClient.post<{ status: StatusAviso }>(`/avisos/${id}/confirmar-recebimento`, {
        schema: recebimentoResposta,
      }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: avisosKeys.detalhe(id) })
      const anterior = qc.getQueryData<Aviso>(avisosKeys.detalhe(id))
      if (anterior) {
        qc.setQueryData<Aviso>(avisosKeys.detalhe(id), { ...anterior, status: 'pago' })
      }
      return { anterior }
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { anterior?: Aviso } | undefined
      if (c?.anterior) qc.setQueryData(avisosKeys.detalhe(id), c.anterior)
    },
    onSettled: () => invalidarTudo(qc, id),
  })
}

/**
 * POST /v1/avisos/:id/desmarcar-recebimento: OTIMISTA (reverte 'pago'→'programado').
 */
export function useDesmarcarRecebimento(id: string) {
  const qc = useQueryClient()
  return useMutation<{ status: StatusAviso }, Error, void>({
    mutationFn: () =>
      apiClient.post<{ status: StatusAviso }>(`/avisos/${id}/desmarcar-recebimento`, {
        schema: recebimentoResposta,
      }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: avisosKeys.detalhe(id) })
      const anterior = qc.getQueryData<Aviso>(avisosKeys.detalhe(id))
      if (anterior) {
        qc.setQueryData<Aviso>(avisosKeys.detalhe(id), { ...anterior, status: 'programado' })
      }
      return { anterior }
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { anterior?: Aviso } | undefined
      if (c?.anterior) qc.setQueryData(avisosKeys.detalhe(id), c.anterior)
    },
    onSettled: () => invalidarTudo(qc, id),
  })
}

/**
 * POST /v1/avisos/:id/rejeitar-pagamento: cobrador diz "não recebi" quando a pessoa
 * informou pagamento (informado_pago → programado). OTIMISTA: volta ao ciclo localmente.
 */
export function useRejeitarPagamento(id: string) {
  const qc = useQueryClient()
  return useMutation<{ status: StatusAviso }, Error, void>({
    mutationFn: () =>
      apiClient.post<{ status: StatusAviso }>(`/avisos/${id}/rejeitar-pagamento`, {
        schema: recebimentoResposta,
      }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: avisosKeys.detalhe(id) })
      const anterior = qc.getQueryData<Aviso>(avisosKeys.detalhe(id))
      if (anterior) {
        qc.setQueryData<Aviso>(avisosKeys.detalhe(id), { ...anterior, status: 'programado' })
      }
      return { anterior }
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { anterior?: Aviso } | undefined
      if (c?.anterior) qc.setQueryData(avisosKeys.detalhe(id), c.anterior)
    },
    onSettled: () => invalidarTudo(qc, id),
  })
}

/**
 * POST /v1/avisos/:id/reengajar (H8.3): cobrador dispara, pós-ciclo, UMA mensagem ao
 * devedor com os 3 botões, sem mudar de estado. PESSIMISTA (o estado não muda; só
 * invalida para a timeline refletir o novo evento). O backend valida pós-ciclo + limite.
 */
export function useReengajar(id: string) {
  const qc = useQueryClient()
  return useMutation<{ status: StatusAviso }, Error, void>({
    mutationFn: () =>
      apiClient.post<{ status: StatusAviso }>(`/avisos/${id}/reengajar`, {
        schema: recebimentoResposta,
      }),
    onSuccess: () => invalidarTudo(qc, id),
  })
}

/**
 * POST /v1/avisos/:id/cancelar: PESSIMISTA (precede ConfirmDialog; sem otimismo).
 * Cancela envios futuros: invalida envios para a timeline refletir o cancelamento.
 */
export function useCancelarAviso(id: string) {
  const qc = useQueryClient()
  return useMutation<Aviso, Error, void>({
    mutationFn: () =>
      apiClient.post<Aviso>(`/avisos/${id}/cancelar`, { schema: avisoSchema }),
    onSuccess: () => invalidarTudo(qc, id),
  })
}

/**
 * PATCH /v1/avisos/:id: edita o combinado (H2.5). Antes do aceite aplica direto; depois
 * do aceite vai a aguardando_aprovacao_aviso_editado (lembretes pausados até o devedor
 * decidir). PESSIMISTA (o estado de retorno define a UI).
 */
export function useEditarAviso(id: string) {
  const qc = useQueryClient()
  return useMutation<Aviso, Error, EditarAvisoBody>({
    mutationFn: (body) =>
      apiClient.patch<Aviso>(`/avisos/${id}`, { body, schema: avisoSchema }),
    onSuccess: () => invalidarTudo(qc, id),
  })
}

/** POST /v1/avisos/:id/desfazer-edicao: volta às condições anteriores (H2.5). */
export function useDesfazerEdicao(id: string) {
  const qc = useQueryClient()
  return useMutation<Aviso, Error, void>({
    mutationFn: () =>
      apiClient.post<Aviso>(`/avisos/${id}/desfazer-edicao`, { schema: avisoSchema }),
    onSuccess: () => invalidarTudo(qc, id),
  })
}

/** POST /v1/avisos/:id/pausar: pausa os lembretes de um combinado aceito (H2.7). */
export function usePausarAviso(id: string) {
  const qc = useQueryClient()
  return useMutation<Aviso, Error, void>({
    mutationFn: () => apiClient.post<Aviso>(`/avisos/${id}/pausar`, { schema: avisoSchema }),
    onSuccess: () => invalidarTudo(qc, id),
  })
}

/** POST /v1/avisos/:id/reativar: retoma o ciclo de um combinado pausado (H2.7). */
export function useReativarAviso(id: string) {
  const qc = useQueryClient()
  return useMutation<Aviso, Error, void>({
    mutationFn: () => apiClient.post<Aviso>(`/avisos/${id}/reativar`, { schema: avisoSchema }),
    onSuccess: () => invalidarTudo(qc, id),
  })
}

/**
 * POST /v1/avisos/:id/ativar (H4.3): ativa uma anotação da agenda (sem_aviso ->
 * aguardando_aceite), gera o convite. Pode levar dados faltantes (telefone/Pix) no corpo.
 * Resposta = formato da criação (aviso + convite). PESSIMISTA.
 */
export function useAtivarAviso(id: string) {
  const qc = useQueryClient()
  return useMutation<CriarAvisoResposta, Error, AtivarAvisoBody>({
    mutationFn: (body) =>
      apiClient.post<CriarAvisoResposta>(`/avisos/${id}/ativar`, {
        body,
        schema: criarAvisoResposta,
      }),
    onSuccess: () => invalidarTudo(qc, id),
  })
}

/** POST /v1/avisos/:id/marcar-pago-agenda (H4.5): fecha a anotação como paga (terminal). */
export function useMarcarPagoAgenda(id: string) {
  const qc = useQueryClient()
  return useMutation<Aviso, Error, void>({
    mutationFn: () => apiClient.post<Aviso>(`/avisos/${id}/marcar-pago-agenda`, { schema: avisoSchema }),
    onSuccess: () => invalidarTudo(qc, id),
  })
}

export type { Aviso, Envio, EventoAviso }
