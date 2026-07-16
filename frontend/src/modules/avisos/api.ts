// Camada de dados do módulo avisos: chamadas à `api` REST + hooks TanStack Query.
// Estado de servidor 100% via React Query; dados só pelo api_client (nunca supabase.from).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/shared/api_client'
import {
  avisoSchema,
  buscarItemResposta,
  buscarPessoaResposta,
  categoriaSchema,
  combinadoEnvioResposta,
  combinadoPreviewResposta,
  criarAvisoResposta,
  envioSchema,
  eventoAvisoSchema,
  listaCategoriasResposta,
  listaProdutosResposta,
  ocorrenciaSchema,
  statusAviso,
  type Aviso,
  type AtivarAvisoBody,
  type BuscarItemResposta,
  type BuscarPessoaResposta,
  type Categoria,
  type Produto,
  type CombinadoEnvioResposta,
  type CombinadoPreviewBody,
  type CombinadoPreviewResposta,
  type CriarAvisoBody,
  type CriarAvisoResposta,
  type CriarCategoriaBody,
  type EditarAvisoBody,
  type Envio,
  type EventoAviso,
  type Ocorrencia,
  type StatusAviso,
} from '@/shared/contracts'
import { z } from 'zod'

// NOTA: a LISTA de combinados (useAvisos + tipos/filtros) mudou-se para o módulo
// painel (modules/painel/api.ts), porque a página unificada /app (Painel) renderiza
// totais + lista juntos e o lint feature-first proíbe o painel importar este módulo.
// As mutations abaixo invalidam a raiz ['avisos'] (avisosKeys.todos), que é prefixo da
// chave da lista lá: por isso uma ação aqui refaz a lista sem importação cruzada.
export const avisosKeys = {
  todos: ['avisos'] as const,
  detalhe: (id: string) => ['avisos', 'detail', id] as const,
  envios: (id: string) => ['avisos', 'envios', id] as const,
  eventos: (id: string) => ['avisos', 'eventos', id] as const,
  ocorrencias: (id: string) => ['avisos', 'ocorrencias', id] as const,
  combinadoEnvio: (id: string) => ['avisos', 'combinado-envio', id] as const,
}

// Prefixo das queries do painel financeiro. Invalidado após mutações que mudam
// totais. NÃO importamos o módulo painel (fronteira do lint): usamos a chave.
const PAINEL_PREFIXO = ['painel'] as const

const enviosResposta = z.array(envioSchema)
const eventosResposta = z.array(eventoAvisoSchema)
const ocorrenciasResposta = z.array(ocorrenciaSchema)

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

// E16: categorias do usuário, para o SELECT no formulário. Chamadas pela rota (o módulo
// avisos não importa o módulo categorias; fronteira do lint). A raiz ['categorias'] é
// compartilhada por string com o módulo categorias (a gerência invalida a mesma chave).
export function useCategorias() {
  return useQuery({
    queryKey: ['categorias'],
    queryFn: ({ signal }) =>
      apiClient.get<Categoria[]>('/categorias', { schema: listaCategoriasResposta, signal }),
  })
}

/**
 * E17: catálogo de produtos do usuário, para o autocomplete do pedido (ItensPedido). Lido por
 * ROTA (o módulo avisos não importa o módulo produtos; fronteira do lint). A key STRING
 * ['produtos'] é a MESMA do módulo produtos (que a invalida ao criar/editar). Degrada 404 -> [].
 */
export function useProdutosCatalogo() {
  return useQuery({
    queryKey: ['produtos'],
    queryFn: async ({ signal }) => {
      try {
        return await apiClient.get<Produto[]>('/produtos', { schema: listaProdutosResposta, signal })
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.code === 'rota_inexistente')) {
          return [] as Produto[]
        }
        throw e
      }
    },
  })
}

/** POST /v1/categorias: cria uma categoria inline no formulário. Invalida ['categorias']. */
export function useCriarCategoria() {
  const qc = useQueryClient()
  return useMutation<Categoria, Error, CriarCategoriaBody>({
    mutationFn: (body) => apiClient.post<Categoria>('/categorias', { body, schema: categoriaSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categorias'] })
    },
  })
}

/**
 * POST /v1/pessoas/buscar-por-telefone (E15 H15.6): autocomplete de contato ao criar.
 * Chamado ao digitar o número (a partir do 6º dígito). O prefixo (E.164 parcial) vai no
 * CORPO, nunca em query/URL (H15.7): telefone não entra em rota nem em log. `prefixo` null
 * desabilita a busca. Modelado como POST-read; cache curto por prefixo (só na memória do
 * cliente). Não importa o módulo pessoas: chama a rota por string (fronteira do lint).
 */
export function useBuscarPessoaPorTelefone(prefixo: string | null) {
  return useQuery({
    queryKey: ['pessoas', 'buscar-por-telefone', prefixo],
    enabled: Boolean(prefixo),
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      apiClient.post<BuscarPessoaResposta>('/pessoas/buscar-por-telefone', {
        body: { prefixo },
        schema: buscarPessoaResposta,
        signal,
      }),
  })
}

/**
 * POST /v1/itens/buscar-por-nome: autocomplete do nome do item ao montar o pedido. Espelha o
 * autocomplete de pessoa: o termo (>= 2 caracteres) vai no CORPO; devolve descrições de itens
 * já usadas pelo próprio criador. `prefixo` null/curto desabilita a busca. Cache curto por
 * termo. Degrada em 404 para lista vazia (backend antigo sem a rota): a UI só não sugere.
 */
export function useBuscarItemPorNome(prefixo: string | null) {
  const termo = prefixo?.trim() ?? ''
  return useQuery({
    queryKey: ['itens', 'buscar-por-nome', termo],
    enabled: termo.length >= 2,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      try {
        return await apiClient.post<BuscarItemResposta>('/itens/buscar-por-nome', {
          body: { prefixo: termo },
          schema: buscarItemResposta,
          signal,
        })
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.code === 'rota_inexistente')) {
          return { itens: [] as string[] }
        }
        throw e
      }
    },
  })
}

/**
 * POST /v1/avisos/combinado-preview: preview da mensagem REAL do combinado (o texto que a
 * outra pessoa recebe no WhatsApp), renderizada pelo BACKEND. Chamado ao revisar antes de
 * enviar (só quando o usuário marca "Enviar aceite"). `habilitado` liga a consulta; `payload`
 * null a desliga. Degrada em 404 (backend antigo sem a rota) para render vazio: a UI só não
 * mostra o preview. Espelha o padrão de useBuscarItemPorNome/useCombinadoEnvio.
 */
export function useCombinadoPreview(payload: CombinadoPreviewBody | null, habilitado: boolean) {
  return useQuery({
    queryKey: ['avisos', 'combinado-preview', payload],
    enabled: habilitado && payload != null,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      try {
        return await apiClient.post<CombinadoPreviewResposta>('/avisos/combinado-preview', {
          body: payload,
          schema: combinadoPreviewResposta,
          signal,
        })
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.code === 'rota_inexistente')) {
          return { render: '', botoes: [] as string[] }
        }
        throw e
      }
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

/**
 * GET /v1/avisos/:id/combinado-envio (E5/H5.0): estado REAL do envio do combinado
 * (enviando/enviado/nao_enviado), para o detalhe não afirmar "enviado" antes de sair. Carrega
 * ao abrir (sem polling; refetch no foco). `habilitado` deve refletir "faz sentido consultar"
 * (aviso em aguardando_aceite). 404 (backend antigo) degrada para null: a UI só não mostra o bloco.
 */
export function useCombinadoEnvio(id: string, habilitado = true) {
  return useQuery({
    queryKey: avisosKeys.combinadoEnvio(id),
    enabled: habilitado,
    queryFn: async ({ signal }) => {
      try {
        return await apiClient.get<CombinadoEnvioResposta>(`/avisos/${id}/combinado-envio`, {
          schema: combinadoEnvioResposta,
          signal,
        })
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.code === 'rota_inexistente')) return null
        throw e
      }
    },
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

/**
 * GET /v1/avisos/:id/ocorrencias (E8 H8.7 / E9 H9.6): as ocorrências de um combinado
 * recorrente (índice, data e status de cada k), para o detalhamento "k de N". Mesma
 * degradação graciosa quando o endpoint não existe (combinado simples não tem ocorrências
 * e a api responde lista vazia; um backend antigo daria 404 e a UI só não mostra a lista).
 */
export function useAvisoOcorrencias(id: string, habilitado = true) {
  return useQuery({
    queryKey: avisosKeys.ocorrencias(id),
    enabled: habilitado,
    queryFn: ({ signal }) =>
      buscarColecaoOpcional<Ocorrencia>(`/avisos/${id}/ocorrencias`, ocorrenciasResposta, signal),
  })
}

/** Invalida detalhe + envios + eventos + ocorrências + lista + resumo após uma ação. */
function invalidarTudo(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: avisosKeys.detalhe(id) })
  void qc.invalidateQueries({ queryKey: avisosKeys.envios(id) })
  void qc.invalidateQueries({ queryKey: avisosKeys.eventos(id) })
  void qc.invalidateQueries({ queryKey: avisosKeys.ocorrencias(id) })
  void qc.invalidateQueries({ queryKey: avisosKeys.combinadoEnvio(id) })
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
 * aguardando_aceite), envia o combinado. Pode levar dados faltantes (telefone/Pix) no corpo.
 * Resposta = formato da criação (só o aviso). PESSIMISTA.
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

export type { Aviso, Envio, EventoAviso, Ocorrencia }
