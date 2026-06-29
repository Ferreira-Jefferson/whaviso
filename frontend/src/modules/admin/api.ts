// Camada de dados do módulo admin (owner): chamadas à `api` REST + hooks
// TanStack Query. Estado de servidor 100% via React Query; dados só pelo
// api_client (nunca supabase.from). Este módulo NUNCA importa outro módulo.
//
// Mapa REAL do backend (backend/apps/api/src/modules/admin/index.ts):
//   GET  /v1/admin/metricas                 ✔ { avisos_por_status, envios_por_status, total_usuarios }
//   GET  /v1/admin/mensagens                ✔ { mensagens: [...] } (templates unificados por chave)
//   POST /v1/admin/mensagens                ✔ 201; lint bloqueia: 422 'linguagem_proibida'
//   POST /v1/admin/mensagens/preview        ✔ { render, lint_ok, palavra_proibida }
//   POST /v1/admin/mensagens/:id/ativar     ✔ 409 'template_nao_aprovado' se não aprovado
//   POST /v1/admin/mensagens/:id/aprovar    ✔ aprovação manual (era Baileys, sem Meta)
//   DELETE /v1/admin/mensagens/:id          ✔ apaga versão; 409 'template_ativo' na ativa
//   GET  /v1/admin/whatsapp                  ✔ { status, numero } (Meta Cloud API; sem QR/comando)
//   GET  /v1/billing/carteira               ✔ (catálogo de créditos reusado aqui via .catalogo)
//   PATCH /v1/admin/creditos-catalogo       ✔ edita a curva (owner, H11.11)
//   GET   /v1/admin/usuarios                ✔ { itens:[perfil+suspenso+saldo da carteira], total, page, per_page }
//   PATCH /v1/admin/usuarios/:id            ✔ { suspenso }: suspende/reativa
//   POST  /v1/admin/usuarios/:id/creditar   ✔ { quantidade }: owner credita envios (H11.11)
// LACUNAS (endpoints que o backend ainda NÃO expõe; degradação graciosa 404):
//   GET  /v1/admin/envios                   ✘ (auditoria de envios)
// Por decisão de privacidade, o owner NÃO acessa avisos individuais de outros
// usuários: não há tela de avisos globais. O valor para o owner são as CONTAGENS
// por status, que já vêm de GET /v1/admin/metricas (gráfico no Métricas).
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient, ApiError } from '@/shared/api_client'
import {
  adminCarteiraResposta,
  adminMensagensResposta,
  adminMetricasResposta,
  adminUsuariosResposta,
  configPlataformaSchema,
  creditosCatalogoSchema,
  type ConfigPlataforma,
  type AdminAtualizarConfigPlataformaBody,
  envioSchema,
  novaMensagemResposta,
  previewMensagemResposta,
  type AdminCarteiraResposta,
  type AdminMensagensResposta,
  type AdminMetricasResposta,
  type AdminUsuario,
  type AdminUsuariosResposta,
  type CreditosCatalogo,
  type CurvaPonto,
  type Envio,
  type NovaMensagemBody,
  type NovaMensagemResposta,
  type Perfil,
  type PreviewMensagemBody,
  type PreviewMensagemResposta,
  type Template,
} from '@/shared/contracts'

export const adminKeys = {
  todos: ['admin'] as const,
  metricas: ['admin', 'metricas'] as const,
  usuarios: (filtros: unknown) => ['admin', 'usuarios', filtros] as const,
  envios: (filtros: unknown) => ['admin', 'envios', filtros] as const,
  catalogo: ['admin', 'creditos-catalogo'] as const,
  configPlataforma: ['admin', 'config-plataforma'] as const,
  whatsapp: ['admin', 'whatsapp'] as const,
  testeNumero: ['admin', 'whatsapp', 'teste', 'numero'] as const,
  testeMensagens: ['admin', 'whatsapp', 'teste', 'mensagens'] as const,
  mensagens: ['admin', 'mensagens'] as const,
}

// ---------------------------------------------------------------------------
// Recurso opcional: endpoint que pode não existir ainda no backend (404).
// Em vez de erro, a UI mostra um estado "indisponível" honesto (degradação
// graciosa). Mesmo padrão do módulo avisos (buscarColecaoOpcional).
// ---------------------------------------------------------------------------
export interface RecursoOpcional<T> {
  dados: T | null
  indisponivel: boolean
}

async function buscarOpcional<T>(
  path: string,
  schema: z.ZodType<T>,
  query: Record<string, string | number | undefined> | undefined,
  signal: AbortSignal | undefined,
): Promise<RecursoOpcional<T>> {
  try {
    const dados = await apiClient.get<T>(path, { schema, query, signal })
    return { dados, indisponivel: false }
  } catch (e) {
    if (
      e instanceof ApiError &&
      (e.status === 404 || e.code === 'rota_inexistente' || e.code === 'erro_inesperado')
    ) {
      return { dados: null, indisponivel: true }
    }
    throw e
  }
}

// ---- Métricas (existe) ----------------------------------------------------
export function useAdminMetricas() {
  return useQuery({
    queryKey: adminKeys.metricas,
    queryFn: ({ signal }) =>
      apiClient.get<AdminMetricasResposta>('/admin/metricas', {
        schema: adminMetricasResposta,
        signal,
      }),
  })
}

// ---- Mensagens UNIFICADAS por chave (tabela `templates`) ------------------
// Mesma maquinaria do ciclo (propor -> aprovar -> ativar -> apagar), mas sobre a
// tabela unificada, com conteúdo ESTRUTURADO (texto + botões + mídia) por chave.
// Hoje serve a família resposta.*. O preview/render SEMPRE vem do backend (risco nº 8).
export function useMensagens() {
  return useQuery({
    queryKey: adminKeys.mensagens,
    queryFn: ({ signal }) =>
      apiClient
        .get<AdminMensagensResposta>('/admin/mensagens', { schema: adminMensagensResposta, signal })
        .then((r) => r.mensagens),
  })
}

export function usePreviewMensagem() {
  return useMutation<PreviewMensagemResposta, Error, PreviewMensagemBody>({
    mutationFn: (body) =>
      apiClient.post<PreviewMensagemResposta>('/admin/mensagens/preview', {
        body,
        schema: previewMensagemResposta,
      }),
  })
}

export function useCriarMensagem() {
  const qc = useQueryClient()
  return useMutation<NovaMensagemResposta, Error, NovaMensagemBody>({
    mutationFn: (body) =>
      apiClient.post<NovaMensagemResposta>('/admin/mensagens', { body, schema: novaMensagemResposta }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.mensagens })
    },
  })
}

const ativarMensagemResposta = z.object({ id: z.uuid(), ativo: z.literal(true) })
export function useAtivarMensagem() {
  const qc = useQueryClient()
  return useMutation<z.infer<typeof ativarMensagemResposta>, Error, string>({
    mutationFn: (id) =>
      apiClient.post(`/admin/mensagens/${id}/ativar`, { schema: ativarMensagemResposta }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.mensagens })
    },
  })
}

const aprovarMensagemResposta = z.object({ id: z.uuid(), status_meta: z.string() })
export function useAprovarMensagem() {
  const qc = useQueryClient()
  return useMutation<z.infer<typeof aprovarMensagemResposta>, Error, string>({
    mutationFn: (id) =>
      apiClient.post(`/admin/mensagens/${id}/aprovar`, { schema: aprovarMensagemResposta }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.mensagens })
    },
  })
}

const apagarMensagemResposta = z.object({ id: z.uuid(), apagado: z.boolean() })
export function useApagarMensagem() {
  const qc = useQueryClient()
  return useMutation<z.infer<typeof apagarMensagemResposta>, Error, string>({
    mutationFn: (id) =>
      apiClient.delete(`/admin/mensagens/${id}`, { schema: apagarMensagemResposta }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.mensagens })
    },
  })
}

export type { Template }

// ---- Conexão do WhatsApp (Meta Cloud API) --------------------------------
// O transporte vive no `zap`, que valida token+phone_id (env) e grava o status na
// sessão (whats_sessao). A api só reflete o status/numero. Não há QR nem comando: a
// conexão é por credenciais. O status 'aguardando_qr' fica no enum só por dados legados.
const whatsappStatus = z.enum(['desconectado', 'aguardando_qr', 'conectado'])
const whatsappSessaoResposta = z.object({
  status: whatsappStatus,
  numero: z.string().nullable(),
  atualizado_em: z.string().nullable(),
})
export type WhatsappStatus = z.infer<typeof whatsappStatus>
export type WhatsappSessao = z.infer<typeof whatsappSessaoResposta>

/** GET /v1/admin/whatsapp: status atual da conexão (status + número de exibição). */
export function useWhatsappSessao() {
  return useQuery<WhatsappSessao>({
    queryKey: adminKeys.whatsapp,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.get<WhatsappSessao>('/admin/whatsapp', {
        schema: whatsappSessaoResposta,
        signal,
      }),
  })
}

// ---- Mini-chat de teste do WhatsApp (diagnóstico) ------------------------
// O owner cadastra um número de teste e troca mensagens de TEXTO com ele para checar
// se o número conectado envia/recebe. A api enfileira a saída; o zap envia/recebe pelo
// Baileys (mesma fila/transporte das automáticas, porém sem template).
const testeNumeroResposta = z.object({ telefone: z.string().nullable() })
type TesteNumeroResposta = z.infer<typeof testeNumeroResposta>

const testeMensagem = z.object({
  id: z.string(),
  direcao: z.enum(['saida', 'entrada']),
  texto: z.string(),
  status: z.enum(['agendado', 'processando', 'enviado', 'falhou', 'recebido']),
  erro: z.string().nullable(),
  horario: z.string(),
})
export type TesteMensagem = z.infer<typeof testeMensagem>
const testeMensagensResposta = z.object({ itens: z.array(testeMensagem) })
type TesteMensagensResposta = z.infer<typeof testeMensagensResposta>
const testeEnviarResposta = z.object({ id: z.string(), status: z.string() })
type TesteEnviarResposta = z.infer<typeof testeEnviarResposta>

/** GET /v1/admin/whatsapp/teste/numero: número de teste atual (E.164) ou null. */
export function useTesteNumero() {
  return useQuery<TesteNumeroResposta>({
    queryKey: adminKeys.testeNumero,
    queryFn: ({ signal }) =>
      apiClient.get<TesteNumeroResposta>('/admin/whatsapp/teste/numero', {
        schema: testeNumeroResposta,
        signal,
      }),
  })
}

/** POST /v1/admin/whatsapp/teste/numero: cadastra/edita o número de teste (E.164 ou null). */
export function useSalvarTesteNumero() {
  const qc = useQueryClient()
  return useMutation<TesteNumeroResposta, Error, string | null>({
    mutationFn: (telefone) =>
      apiClient.post<TesteNumeroResposta>('/admin/whatsapp/teste/numero', {
        body: { telefone },
        schema: testeNumeroResposta,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.testeNumero }),
  })
}

/** GET /v1/admin/whatsapp/teste/mensagens: histórico do mini-chat. Poll de 2s quando ativo. */
export function useTesteMensagens(ativo: boolean) {
  return useQuery<TesteMensagensResposta>({
    queryKey: adminKeys.testeMensagens,
    refetchInterval: ativo ? 2_000 : false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.get<TesteMensagensResposta>('/admin/whatsapp/teste/mensagens', {
        schema: testeMensagensResposta,
        signal,
      }),
  })
}

/** POST /v1/admin/whatsapp/teste/enviar: enfileira uma mensagem para o número de teste. */
export function useEnviarTeste() {
  const qc = useQueryClient()
  return useMutation<TesteEnviarResposta, Error, string>({
    mutationFn: (texto) =>
      apiClient.post<TesteEnviarResposta>('/admin/whatsapp/teste/enviar', {
        body: { texto },
        schema: testeEnviarResposta,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.testeMensagens }),
  })
}

// ---- Créditos: curva de preço (catálogo). Leitura reusa GET /billing/carteira ----
// (que devolve { carteira, catalogo }); a edição é do owner (PATCH /admin/creditos-catalogo).
// O owner é também um usuário com carteira, então lê o catálogo pela mesma rota.
const carteiraComCatalogo = z.object({
  carteira: z.object({}).passthrough(),
  catalogo: creditosCatalogoSchema,
})

export function useCreditosCatalogo() {
  return useQuery({
    queryKey: adminKeys.catalogo,
    queryFn: ({ signal }) =>
      apiClient
        .get<{ catalogo: CreditosCatalogo }>('/billing/carteira', { schema: carteiraComCatalogo, signal })
        .then((r) => r.catalogo),
  })
}

// PATCH /v1/admin/creditos-catalogo: edita a curva de MARCOS (tabela envios -> R$/envio),
// a cortesia e os tetos de agenda. Atualização parcial. envios_min/max derivam dos marcos
// (não são editados direto). Invalida o catálogo admin E as chaves de billing (['billing'])
// para a tela de Créditos do usuário refletir a mudança na hora.
export interface AtualizarCatalogoBody {
  curva?: CurvaPonto[]
  cortesia_inicial?: number
  agenda_teto_free?: number
  agenda_teto_pago?: number
}

export function useAtualizarCatalogo() {
  const qc = useQueryClient()
  return useMutation<CreditosCatalogo, Error, AtualizarCatalogoBody>({
    mutationFn: (body) =>
      apiClient.patch<CreditosCatalogo>('/admin/creditos-catalogo', { body, schema: creditosCatalogoSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.catalogo })
      // Prefixo das queries do billing (carteira/catálogo), por chave e nunca por import
      // do módulo billing (fronteira do lint). Reflete a edição do owner na hora.
      void qc.invalidateQueries({ queryKey: ['billing'] })
    },
  })
}

// ---- Chave Pix da plataforma (config singleton, owner, H11.10) ------------
// GET/PATCH /v1/admin/config-plataforma: a chave Pix que vai na mensagem de compra de
// crédito empurrada ao WhatsApp do usuário (template billing.recarga). Edição PARCIAL
// (campos ausentes ficam; null limpa). A chave nunca é exposta ao usuário final.
export function useConfigPlataforma() {
  return useQuery({
    queryKey: adminKeys.configPlataforma,
    queryFn: ({ signal }) =>
      apiClient.get<ConfigPlataforma>('/admin/config-plataforma', {
        schema: configPlataformaSchema,
        signal,
      }),
  })
}

export function useAtualizarConfigPlataforma() {
  const qc = useQueryClient()
  return useMutation<ConfigPlataforma, Error, AdminAtualizarConfigPlataformaBody>({
    mutationFn: (body) =>
      apiClient.patch<ConfigPlataforma>('/admin/config-plataforma', {
        body,
        schema: configPlataformaSchema,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.configPlataforma })
    },
  })
}

// ---- LACUNAS: endpoints ainda inexistentes (degradação graciosa) ----------

// GET /v1/admin/usuarios?busca=&page=: envelope paginado de perfis (+ plano +
// estado de suspensão). Schemas espelhados em shared/contracts/payloads.
const listaUsuariosResposta = adminUsuariosResposta
export type UsuarioAdmin = AdminUsuario
export type ListaUsuariosResposta = AdminUsuariosResposta

export interface FiltrosUsuarios {
  busca?: string
  page?: number
}

export function useAdminUsuarios(filtros: FiltrosUsuarios) {
  return useQuery({
    queryKey: adminKeys.usuarios(filtros),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      buscarOpcional<ListaUsuariosResposta>(
        '/admin/usuarios',
        listaUsuariosResposta,
        { busca: filtros.busca || undefined, page: filtros.page },
        signal,
      ),
  })
}

// PATCH /v1/admin/usuarios/:id: suspensão/reativação da conta (E11: a troca de plano
// saiu). Suspenso = bloqueado na api (403 conta_suspensa em toda rota autenticada).
const atualizarUsuarioResposta = z.object({
  id: z.uuid(),
  suspenso: z.boolean(),
})
export type AtualizarUsuarioResposta = z.infer<typeof atualizarUsuarioResposta>

export interface AtualizarUsuarioVars {
  id: string
  suspenso: boolean
}

export function useAtualizarUsuario() {
  const qc = useQueryClient()
  return useMutation<AtualizarUsuarioResposta, Error, AtualizarUsuarioVars>({
    mutationFn: ({ id, ...body }) =>
      apiClient.patch<AtualizarUsuarioResposta>(`/admin/usuarios/${id}`, {
        body,
        schema: atualizarUsuarioResposta,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.todos })
    },
  })
}

// POST /v1/admin/usuarios/:id/creditar: o owner CREDITA N envios na carteira da conta
// (H11.11, ativação manual pós-pagamento via WhatsApp). Aditivo + lançamento append-only.
export interface CreditarVars {
  id: string
  quantidade: number
}

export function useCreditarUsuario() {
  const qc = useQueryClient()
  return useMutation<AdminCarteiraResposta, Error, CreditarVars>({
    mutationFn: ({ id, quantidade }) =>
      apiClient.post<AdminCarteiraResposta>(`/admin/usuarios/${id}/creditar`, {
        body: { quantidade },
        schema: adminCarteiraResposta,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.todos })
    },
  })
}

// GET /v1/admin/envios?de=&ate=&status=&etapa=&page=: auditoria do ciclo.
// O envio já tem aviso_id; um endpoint coerente enriqueceria com nome do
// destinatário, mas aceitamos o schema base de Envio (+ nome opcional).
const envioAuditoriaSchema = envioSchema.extend({
  nome_devedor: z.string().nullable().optional(),
})
export type EnvioAuditoria = z.infer<typeof envioAuditoriaSchema>

const listaEnviosResposta = z.object({
  itens: z.array(envioAuditoriaSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type ListaEnviosResposta = z.infer<typeof listaEnviosResposta>

export interface FiltrosEnvios {
  de?: string
  ate?: string
  status?: string
  etapa?: string
  page?: number
}

export function useAdminEnvios(filtros: FiltrosEnvios) {
  return useQuery({
    queryKey: adminKeys.envios(filtros),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      buscarOpcional<ListaEnviosResposta>(
        '/admin/envios',
        listaEnviosResposta,
        {
          de: filtros.de || undefined,
          ate: filtros.ate || undefined,
          status: filtros.status || undefined,
          etapa: filtros.etapa || undefined,
          page: filtros.page,
        },
        signal,
      ),
  })
}

export type { Envio, Perfil }
