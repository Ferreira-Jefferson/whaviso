// ESPELHO de backend/packages/shared/src/contracts/payloads.ts
// Cópia própria do frontend (standalone). Manter em sincronia com o backend.
import { z } from 'zod'
import {
  acaoDevedor,
  contextoTemplate,
  direcaoAviso,
  papelAviso,
  statusAviso,
  statusMetaTemplate,
  tipoChavePix,
} from './enums'
import {
  avisoSchema,
  chavePixSchema,
  conteudoTemplate,
  dataCombinada,
  motivoAviso,
  perfilSchema,
  telefoneE164,
  templateSchema,
  valorCentavos,
} from './entidades'

// ---- POST /v1/avisos ----
// receber: convido o DEVEDOR. pagar (invertido): EU sou o devedor e convido o COBRADOR.
export const criarAvisoBody = z
  .object({
    direcao: direcaoAviso,
    // H4.1: `enviar` gera convite agora; `agenda` só anota (nasce sem_aviso, sem envio).
    modo: z.enum(['enviar', 'agenda']).default('enviar'),
    nome_devedor: z.string().trim().min(1).max(120),
    telefone_devedor: telefoneE164.nullish(),
    nome_cobrador: z.string().trim().min(1).max(120).nullish(),
    telefone_cobrador: telefoneE164.nullish(),
    motivo: motivoAviso,
    valor_centavos: valorCentavos,
    data_combinada: dataCombinada,
    // Pix OBRIGATÓRIO no receber (H2.1): chave + titular + banco. Diferido no modo agenda.
    pix_chave: z.string().trim().max(140).nullish(),
    pix_titular: z.string().trim().max(120).nullish(),
    pix_banco: z.string().trim().max(80).nullish(),
  })
  // No modo `agenda` (H4.1) telefone e Pix são opcionais (cobrados só ao ativar).
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'receber' || b.telefone_devedor != null, {
    message: 'telefone_devedor é obrigatório para receber',
    path: ['telefone_devedor'],
  })
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'pagar' || (b.nome_cobrador != null && b.telefone_cobrador != null), {
    message: 'nome_cobrador e telefone_cobrador são obrigatórios para pagar',
    path: ['telefone_cobrador'],
  })
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'receber' || (b.pix_chave != null && b.pix_chave.length > 0), {
    message: 'a chave Pix é obrigatória',
    path: ['pix_chave'],
  })
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'receber' || (b.pix_titular != null && b.pix_titular.length > 0), {
    message: 'informe o nome do titular da chave Pix',
    path: ['pix_titular'],
  })
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'receber' || (b.pix_banco != null && b.pix_banco.length > 0), {
    message: 'informe o banco da chave Pix',
    path: ['pix_banco'],
  })
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'pagar' || (b.pix_chave != null && b.pix_chave.length > 0), {
    message: 'a chave Pix de quem vai receber é obrigatória',
    path: ['pix_chave'],
  })
export type CriarAvisoBody = z.infer<typeof criarAvisoBody>

export const criarAvisoResposta = z.object({
  aviso: avisoSchema,
  // E5: aceite 100% WhatsApp (sem site). Número de convite em claro (xxx-xxx), mensagem
  // pronta e link wa.me do Whaviso. null no modo agenda (nada enviado).
  numero_convite: z.string().nullable(),
  mensagem_convite: z.string().nullable(),
  link_whatsapp: z.string().nullable(),
})
export type CriarAvisoResposta = z.infer<typeof criarAvisoResposta>

// ---- POST /v1/avisos/:id/ativar (H4.3) ----
// Ativa uma anotação da agenda (sem_aviso -> aguardando_aceite), gera o convite e
// devolve o MESMO formato da criação. Dados faltantes (telefone/Pix) podem vir no corpo.
export const ativarAvisoBody = z.object({
  telefone_devedor: telefoneE164.nullish(),
  nome_cobrador: z.string().trim().min(1).max(120).nullish(),
  telefone_cobrador: telefoneE164.nullish(),
  pix_chave: z.string().trim().max(140).nullish(),
  pix_titular: z.string().trim().max(120).nullish(),
  pix_banco: z.string().trim().max(80).nullish(),
})
export type AtivarAvisoBody = z.infer<typeof ativarAvisoBody>

// ---- PATCH /v1/avisos/:id (editar, H2.5) ----
export const editarAvisoBody = z
  .object({
    nome_devedor: z.string().trim().min(1).max(120).optional(),
    motivo: motivoAviso.optional(),
    valor_centavos: valorCentavos.optional(),
    data_combinada: dataCombinada.optional(),
    pix_chave: z.string().trim().min(1).max(140).optional(),
    pix_titular: z.string().trim().min(1).max(120).optional(),
    pix_banco: z.string().trim().min(1).max(80).optional(),
  })
  .refine(
    (b) =>
      b.nome_devedor !== undefined ||
      b.motivo !== undefined ||
      b.valor_centavos !== undefined ||
      b.data_combinada !== undefined ||
      b.pix_chave !== undefined ||
      b.pix_titular !== undefined ||
      b.pix_banco !== undefined,
    { message: 'informe ao menos um campo para editar' },
  )
export type EditarAvisoBody = z.infer<typeof editarAvisoBody>

// ---- GET /v1/avisos ----
// H9.1/H9.3: filtra POR PAPEL (não direção; cobre o invertido), por `grupo` decidido no
// SERVIDOR (ativos/agenda/historico), busca por nome OU motivo, ordena por data combinada.
export const listarAvisosQuery = z.object({
  status: statusAviso.optional(),
  direcao: direcaoAviso.optional(),
  papel: papelAviso.optional(),
  grupo: z.enum(['ativos', 'agenda', 'historico']).optional(),
  busca: z.string().trim().min(1).max(120).optional(),
  ordenar: z.enum(['data_combinada', 'criado_em']).default('criado_em'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListarAvisosQuery = z.infer<typeof listarAvisosQuery>

// E5: o aceite por SITE saiu (aceite 100% pelo WhatsApp). Os contratos das rotas
// GET/POST /aceite/:token (`aceiteInfoResposta`/`aceitarBody`/`aceitarResposta`) foram
// removidos junto com a página pública. As ações do devedor por link (`/acao/:token`)
// continuam (E7), com seu próprio contrato `acaoResposta`.

// ---- POST /v1/auth/status-telefone (público; H1.2/H1.3) ----
// A UI consulta para escolher a copy do OTP: login (número já cadastrado) vs cadastro
// (número novo). Resposta mínima (só `existe`) para não vazar mais que a história pede.
export const statusTelefoneBody = z.object({
  telefone: z.string(),
})
export type StatusTelefoneBody = z.infer<typeof statusTelefoneBody>

export const statusTelefoneResposta = z.object({
  existe: z.boolean(),
})
export type StatusTelefoneResposta = z.infer<typeof statusTelefoneResposta>

// ---- POST /v1/acao/:token (público) ----
export const acaoBody = z.object({
  acao: acaoDevedor,
})
export type AcaoBody = z.infer<typeof acaoBody>

// Resposta da ação pública: `aplicado` = false quando o aviso já estava em
// estado terminal (idempotente). `status` reflete o estado atual do aviso.
export const acaoResposta = z.object({
  status: statusAviso,
  aplicado: z.boolean(),
})
export type AcaoResposta = z.infer<typeof acaoResposta>

// ---- GET /v1/painel/resumo ----
// Totais POR PAPEL (H9.2) em centavos, calculados no backend. Terminais não-pagos fora.
// Campos legados mantidos (billing.useUsoAtivos).
export const painelResumoQuery = z.object({
  de: dataCombinada.optional(),
  ate: dataCombinada.optional(),
})
export const painelResumoResposta = z.object({
  a_receber_centavos: z.number().int(),
  a_receber_qtd: z.number().int(),
  recebido_centavos: z.number().int(),
  recebido_qtd: z.number().int(),
  a_pagar_centavos: z.number().int(),
  a_pagar_qtd: z.number().int(),
  pago_centavos: z.number().int(),
  pago_qtd: z.number().int(),
  // Legado (compatibilidade).
  pendentes_centavos: z.number().int(),
  recebidos_centavos: z.number().int(),
  pagos_centavos: z.number().int(),
  qtd_pendentes: z.number().int(),
  qtd_aguardando_aceite: z.number().int(),
})
export type PainelResumoResposta = z.infer<typeof painelResumoResposta>

// ---- GET /v1/painel/pendencias ("precisa de você", H9.2) ----
export const tipoPendencia = z.enum(['confirmar_pagamento', 'aprovar_edicao'])
export type TipoPendencia = z.infer<typeof tipoPendencia>

export const pendenciaSchema = z.object({
  aviso_id: z.uuid(),
  tipo: tipoPendencia,
  papel: papelAviso,
  nome_outra_ponta: z.string(),
  motivo: z.string(),
  valor_centavos: z.number().int(),
  data_combinada: dataCombinada,
})
export type Pendencia = z.infer<typeof pendenciaSchema>

export const painelPendenciasResposta = z.object({
  itens: z.array(pendenciaSchema),
  total: z.number().int(),
})
export type PainelPendenciasResposta = z.infer<typeof painelPendenciasResposta>

// ---- PATCH /v1/perfil ----
export const atualizarPerfilBody = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  telefone: telefoneE164.nullish(),
})
export type AtualizarPerfilBody = z.infer<typeof atualizarPerfilBody>

// ---- /v1/perfil/chaves-pix ----
export const listaChavesPixResposta = z.array(chavePixSchema)
export type ListaChavesPixResposta = z.infer<typeof listaChavesPixResposta>

export const criarChavePixBody = z.object({
  tipo: tipoChavePix,
  chave: z.string().trim().min(1).max(140),
  rotulo: z.string().trim().max(60).nullish(),
  // titular + banco (0044) obrigatórios: a chave os carrega para o aviso herdar.
  titular: z.string().trim().min(1).max(120),
  banco: z.string().trim().min(1).max(80),
  padrao: z.boolean().optional(),
})
export type CriarChavePixBody = z.infer<typeof criarChavePixBody>

export const atualizarChavePixBody = z
  .object({
    rotulo: z.string().trim().max(60).nullish(),
    titular: z.string().trim().min(1).max(120).optional(),
    banco: z.string().trim().min(1).max(80).optional(),
    padrao: z.boolean().optional(),
    arquivada: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.rotulo !== undefined ||
      b.titular !== undefined ||
      b.banco !== undefined ||
      b.padrao !== undefined ||
      b.arquivada !== undefined,
    { message: 'informe rotulo, titular, banco, padrao e/ou arquivada' },
  )
export type AtualizarChavePixBody = z.infer<typeof atualizarChavePixBody>

// ---- GET /v1/admin/metricas (owner) ----
// O backend agrega contagens por status; chaves são os valores dos enums, mas
// nem todo status aparece (group by só traz os existentes) → record parcial.
export const adminMetricasResposta = z.object({
  avisos_por_status: z.record(z.string(), z.number().int()),
  envios_por_status: z.record(z.string(), z.number().int()),
  total_usuarios: z.number().int(),
})
export type AdminMetricasResposta = z.infer<typeof adminMetricasResposta>

// ---- GET /v1/admin/usuarios (owner): perfil + suspensão + plano ----
export const adminUsuarioSchema = perfilSchema.extend({
  nome: z.string().max(120),
  suspenso: z.boolean(),
  plano_id: z.string().nullable().optional(),
  plano_status: z.string().nullable().optional(),
})
export type AdminUsuario = z.infer<typeof adminUsuarioSchema>

export const adminUsuariosResposta = z.object({
  itens: z.array(adminUsuarioSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type AdminUsuariosResposta = z.infer<typeof adminUsuariosResposta>

// ---- PATCH /v1/admin/usuarios/:id (owner): troca plano e/ou suspende ----
export const adminAtualizarUsuarioBody = z
  .object({
    plano_id: z.string().min(1).max(40).optional(),
    suspenso: z.boolean().optional(),
  })
  .refine((b) => b.plano_id !== undefined || b.suspenso !== undefined, {
    message: 'informe plano_id e/ou suspenso',
  })
export type AdminAtualizarUsuarioBody = z.infer<typeof adminAtualizarUsuarioBody>

// Templates de mensagem: a maquinaria de edição (listar/propor/preview/ativar/
// aprovar/apagar) vive em /v1/admin/mensagens (templates unificados por chave),
// mais abaixo neste arquivo. Não há mais /admin/templates.

// ---- GET /v1/billing/planos (reusado pela área admin) ----
// Catálogo dos 4 planos (Épico 11) com a AGENDA como balde único e as alavancas
// por plano. No Plus (por_envio=true) o preço é por VOLUME DE ENVIOS (migration
// 0044): `preco_centavos` é o total no piso (`envios_min`), `preco_max_centavos` o
// total no topo (`envios_max`); o R$/envio cai conforme o volume sobe. O total
// intermediário é interpolado (o backend recomputa o congelado no assinar).
export const planoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  preco_centavos: z.number().int(),
  max_avisos_ativos: z.number().int().nullable(),
  permite_recorrente: z.boolean(),
  // Alavancas (lidas do catálogo, nunca fixadas no front).
  capacidade_agenda: z.number().int(),
  vagas_ativas: z.number().int().nullable(),
  cadencia_configuravel: z.boolean(),
  menu_texto_livre: z.boolean(),
  informado_pago_habilitado: z.boolean(),
  totais_periodo: z.boolean(),
  por_unidade: z.boolean(),
  agenda_por_unidade: z.number().int(),
  ativaveis_por_unidade: z.number().int(),
  reengajamento_max: z.number().int(),
  somente_leitura: z.boolean(),
  // Curva de preço por envio (Plus). Nulos nos planos que não são por_envio.
  por_envio: z.boolean(),
  envios_min: z.number().int().nullable(),
  envios_max: z.number().int().nullable(),
  preco_max_centavos: z.number().int().nullable(),
})
export type Plano = z.infer<typeof planoSchema>

export const listaPlanosResposta = z.object({
  planos: z.array(planoSchema),
})
export type ListaPlanosResposta = z.infer<typeof listaPlanosResposta>

// ---- GET /v1/billing/assinatura (JWT) ----
// A conta NASCE no free (linha real no signup). `status`:
//   trial = período de cortesia · ativa = vigente · cancelada = encerrada.
// As alavancas vêm EFETIVAS (capacidade/vagas já resolvidas por unidade no Plus).
// No Plus, `unidades` e `preco_centavos` (congelado) vêm preenchidos.
export const statusAssinatura = z.enum(['trial', 'ativa', 'cancelada'])
export type StatusAssinatura = z.infer<typeof statusAssinatura>

export const assinaturaSchema = z.object({
  plano_id: z.string(),
  status: statusAssinatura,
  nome: z.string().nullable().optional(),
  preco_centavos: z.number().int().nullable().optional(),
  unidades: z.number().int().nullable().optional(),
  // Alavancas efetivas do plano vigente (espelho do backend).
  capacidade_agenda: z.number().int().optional(),
  vagas_ativas: z.number().int().nullable().optional(),
  somente_leitura: z.boolean().optional(),
  permite_recorrente: z.boolean().optional(),
  cadencia_configuravel: z.boolean().optional(),
  menu_texto_livre: z.boolean().optional(),
  informado_pago_habilitado: z.boolean().optional(),
  totais_periodo: z.boolean().optional(),
  reengajamento_max: z.number().int().optional(),
  implicito: z.boolean().optional(),
})
export type Assinatura = z.infer<typeof assinaturaSchema>

// ---- POST /v1/billing/assinar (JWT) ----
// No Plus, `unidades` carrega o nº de ENVIOS/mês escolhido; os demais a ignoram. A
// faixa exata (envios_min..envios_max) é validada no backend contra o catálogo.
export const assinarBody = z
  .object({
    plano_id: z.enum(['free', 'start', 'profissional', 'plus']),
    unidades: z.number().int().min(1).max(2000).optional(),
  })
  .refine((b) => b.plano_id !== 'plus' || b.unidades !== undefined, {
    message: 'o plano Plus exige a quantidade de envios',
  })
export type AssinarBody = z.infer<typeof assinarBody>

export const assinarResposta = z.object({
  plano_id: z.string(),
  status: statusAssinatura,
  unidades: z.number().int().nullable(),
  preco_centavos: z.number().int().nullable(),
})
export type AssinarResposta = z.infer<typeof assinarResposta>

// ---- POST /v1/billing/checkout (JWT) ----
export const checkoutResposta = z.object({
  pagamento_id: z.string(),
  status: z.string(),
  checkout_url: z.string().nullable(),
})
export type CheckoutResposta = z.infer<typeof checkoutResposta>

// ---- /v1/admin/mensagens (templates UNIFICADOS por chave) ----
// Mesma maquinaria do ciclo (propor versão -> aprovar -> ativar), mas sobre a
// tabela `templates`, com conteúdo ESTRUTURADO (texto + botões + mídia) por chave.
export const adminMensagensResposta = z.object({
  mensagens: z.array(templateSchema),
})
export type AdminMensagensResposta = z.infer<typeof adminMensagensResposta>

export const novaMensagemBody = z
  .object({
    chave: z.string().trim().min(1).max(80),
    contexto: contextoTemplate.default('padrao'),
    nome_meta: z.string().trim().min(1).max(120),
    idioma: z.string().default('pt_BR'),
    conteudo: conteudoTemplate,
    variaveis: z.array(z.string()).default([]),
  })
  .refine((b) => b.conteudo.texto.trim().length > 0 || b.conteudo.midia != null, {
    message: 'a mensagem precisa de texto ou mídia',
    path: ['conteudo', 'texto'],
  })
export type NovaMensagemBody = z.infer<typeof novaMensagemBody>

export const novaMensagemResposta = z.object({
  id: z.uuid(),
  chave: z.string(),
  nome_meta: z.string(),
  versao: z.number().int().positive(),
  status_meta: statusMetaTemplate,
  ativo: z.boolean(),
  // Alerta de gênero (heurística, H13.10 🟡): trechos gendered que salvaram mesmo
  // assim (não bloqueia). Vazio quando neutro.
  avisos_genero: z.array(z.string()).default([]),
})
export type NovaMensagemResposta = z.infer<typeof novaMensagemResposta>

export const previewMensagemBody = z.object({
  conteudo: conteudoTemplate,
  variaveis: z.array(z.string()).default([]),
  valores: z.record(z.string(), z.string()).default({}),
})
export type PreviewMensagemBody = z.infer<typeof previewMensagemBody>

export const previewMensagemResposta = z.object({
  render: z.string(),
  // lint_ok cai com proibida OU travessão; gênero é só aviso e não afeta lint_ok.
  lint_ok: z.boolean(),
  palavra_proibida: z.string().nullable(),
  travessao: z.string().nullable(),
  // Alerta de gênero (heurística, H13.10 🟡): informa, nunca bloqueia.
  avisos_genero: z.array(z.string()).default([]),
})
export type PreviewMensagemResposta = z.infer<typeof previewMensagemResposta>

// ---- Envelope de erro padrão ----
export const erroResposta = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})
export type ErroResposta = z.infer<typeof erroResposta>
