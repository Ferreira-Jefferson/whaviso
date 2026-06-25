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
//   GET  /v1/admin/whatsapp                  ✔ { status, numero, qr_img(dataURL), comando_pendente }
//   POST /v1/admin/whatsapp/conectar        ✔ enfileira comando p/ o zap abrir o socket (gera QR)
//   POST /v1/admin/whatsapp/desconectar     ✔ enfileira comando p/ o zap deslogar (exige QR novo)
//   GET  /v1/billing/planos                 ✔ (módulo billing, reusado aqui)
//   GET   /v1/admin/usuarios                ✔ { itens:[perfil+suspenso+plano], total, page, per_page }
//   PATCH /v1/admin/usuarios/:id            ✔ { plano_id?, suspenso? }: troca plano / suspende-reativa
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
  adminMensagensResposta,
  adminMetricasResposta,
  adminUsuariosResposta,
  envioSchema,
  listaPlanosResposta,
  novaMensagemResposta,
  previewMensagemResposta,
  type AdminMensagensResposta,
  type AdminMetricasResposta,
  type AdminUsuario,
  type AdminUsuariosResposta,
  type Envio,
  type ListaPlanosResposta,
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
  planos: ['admin', 'planos'] as const,
  whatsapp: ['admin', 'whatsapp'] as const,
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

// ---- Conexão do WhatsApp (Baileys) ---------------------------------------
// O socket vive no `zap`; a api só reflete a sessão (whats_sessao) e enfileira
// comandos. O QR vem já renderizado como imagem (dataURL) pelo backend.
const whatsappStatus = z.enum(['desconectado', 'aguardando_qr', 'conectado'])
const whatsappSessaoResposta = z.object({
  status: whatsappStatus,
  numero: z.string().nullable(),
  qr_img: z.string().nullable(),
  comando_pendente: z.enum(['conectar', 'desconectar']).nullable(),
  atualizado_em: z.string().nullable(),
})
export type WhatsappStatus = z.infer<typeof whatsappStatus>
export type WhatsappSessao = z.infer<typeof whatsappSessaoResposta>

// Poll de 1,5s em duas situações: (1) há uma intenção pendente (a tela disparou
// conectar/desconectar e o banco ainda não refletiu o desfecho); ou (2) o status
// real é 'aguardando_qr', ou seja, o QR está na tela esperando a leitura. O caso
// (2) é o que faz a conexão ser detectada SOZINHA: quando o owner escaneia, o zap
// grava 'conectado' e o poll vira a tela na hora (sem clicar em atualizar); de
// quebra, o QR rotacionado pelo Baileys também atualiza sozinho. Para de pollar ao
// conectar ou ao voltar para desconectado ocioso, evitando o poll perpétuo.
export function useWhatsappSessao(aguardando: boolean) {
  return useQuery<WhatsappSessao>({
    queryKey: adminKeys.whatsapp,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      aguardando || query.state.data?.status === 'aguardando_qr' ? 1_500 : false,
    queryFn: ({ signal }) =>
      apiClient.get<WhatsappSessao>('/admin/whatsapp', {
        schema: whatsappSessaoResposta,
        signal,
      }),
  })
}

const comandoWhatsappResposta = z.object({
  comando: z.enum(['conectar', 'desconectar']),
})
export type ComandoWhatsappResposta = z.infer<typeof comandoWhatsappResposta>

function useComandoWhatsapp(path: string) {
  const qc = useQueryClient()
  return useMutation<ComandoWhatsappResposta, Error, void>({
    mutationFn: () =>
      apiClient.post<ComandoWhatsappResposta>(path, { schema: comandoWhatsappResposta }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.whatsapp })
    },
  })
}

/** POST /v1/admin/whatsapp/conectar: o zap (re)abre o socket e gera o QR. */
export function useConectarWhatsapp() {
  return useComandoWhatsapp('/admin/whatsapp/conectar')
}

/** POST /v1/admin/whatsapp/desconectar: logout + apaga a sessão (exige QR novo). */
export function useDesconectarWhatsapp() {
  return useComandoWhatsapp('/admin/whatsapp/desconectar')
}

// ---- Planos (reusa billing) ----------------------------------------------
export function useAdminPlanos() {
  return useQuery({
    queryKey: adminKeys.planos,
    queryFn: ({ signal }) =>
      buscarOpcional<ListaPlanosResposta>('/billing/planos', listaPlanosResposta, undefined, signal),
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

// PATCH /v1/admin/usuarios/:id: troca de plano e/ou suspensão da conta.
// Suspenso = bloqueado na api (403 conta_suspensa em toda rota autenticada).
const atualizarUsuarioResposta = z.object({
  id: z.uuid(),
  plano_id: z.string().nullable(),
  suspenso: z.boolean().optional(),
})
export type AtualizarUsuarioResposta = z.infer<typeof atualizarUsuarioResposta>

export interface AtualizarUsuarioVars {
  id: string
  suspenso?: boolean
  plano_id?: string
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
