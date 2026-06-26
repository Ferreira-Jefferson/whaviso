import { z } from 'zod'
import {
  acaoBotaoTemplate,
  atorEvento,
  contextoTemplate,
  direcaoAviso,
  entregaStatus,
  etapaEnvio,
  papelAviso,
  roleUsuario,
  statusAviso,
  statusEnvio,
  statusMetaTemplate,
  tipoChavePix,
  tipoEvento,
  tipoMidiaTemplate,
} from './enums'

export const telefoneE164 = z
  .string()
  .regex(/^\+[1-9][0-9]{9,14}$/, 'telefone deve estar em E.164 (ex.: +5511999998888)')

export const valorCentavos = z.number().int().positive()

export const motivoAviso = z.string().trim().min(3).max(120)

/** Data de negócio (sem hora), interpretada em America/Sao_Paulo. */
export const dataCombinada = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const perfilSchema = z.object({
  id: z.uuid(),
  // perfil nasce com nome '' (trigger handle_new_user) até o onboarding; toleramos vazio
  nome: z.string().max(120),
  telefone: telefoneE164.nullable(),
  role: roleUsuario,
  criado_em: z.coerce.date(),
  atualizado_em: z.coerce.date(),
})
export type Perfil = z.infer<typeof perfilSchema>

// Chave Pix salva do usuário (N por perfil; 1 padrão). Gerenciada na Conta,
// oferecida como opção no cadastro de um aviso. Veja chaves_pix (migration 0012).
export const chavePixSchema = z.object({
  id: z.uuid(),
  tipo: tipoChavePix,
  chave: z.string().max(140),
  rotulo: z.string().max(60).nullable(),
  // Titular + banco da chave (0044): preenchidos no cadastro; o aviso herda como
  // snapshot (pix_titular/pix_banco). Nullable p/ chaves legadas (pré-0044).
  titular: z.string().max(120).nullable(),
  banco: z.string().max(80).nullable(),
  padrao: z.boolean(),
  arquivada: z.boolean(),
  criado_em: z.coerce.date(),
  atualizado_em: z.coerce.date(),
})
export type ChavePix = z.infer<typeof chavePixSchema>

export const avisoSchema = z.object({
  id: z.uuid(),
  // nullable: no fluxo invertido o cobrador é convidado e só vincula conta ao aceitar.
  cobrador_id: z.uuid().nullable(),
  devedor_profile_id: z.uuid().nullable(),
  direcao: direcaoAviso,
  // papel de quem criou (receber: cobrador; pagar invertido: devedor).
  criador_papel: papelAviso,
  status: statusAviso,
  nome_devedor: z.string().min(1).max(120),
  telefone_devedor: telefoneE164.nullable(),
  // no invertido, dados do cobrador convidado (denormalizados, sem profile até vincular).
  nome_cobrador: z.string().min(1).max(120).nullable(),
  telefone_cobrador: telefoneE164.nullable(),
  motivo: motivoAviso,
  valor_centavos: valorCentavos,
  data_combinada: dataCombinada,
  pix_chave: z.string().max(140).nullable(),
  // Titular + banco da chave Pix: compõem a 2ª mensagem do Pix ao devedor (E7 H7.3).
  // Denormalizados no aviso (instantâneo do combinado), nunca logados (H13/segurança).
  pix_titular: z.string().max(120).nullable(),
  pix_banco: z.string().max(80).nullable(),
  aceito_em: z.coerce.date().nullable(),
  // Arquivamento da agenda (H11.4): quando preenchido, a anotação sai da contagem/
  // visão da agenda (soft-delete; o registro permanece, regra de não-DELETE).
  arquivado_em: z.coerce.date().nullable(),
  // Recorrência (E6 H6.10 / E8 H8.7): combinado SIMPLES = tudo null. Quando recorrente,
  // o combinado segue UMA linha; as ocorrências vivem em aviso_ocorrencias. `ocorrencia_atual`
  // é o ponteiro 1..N; o status do aviso reflete a ocorrência corrente (pago só no fim).
  recorrencia_tipo: z.enum(['periodo', 'avulsas']).nullish(),
  recorrencia_freq: z.enum(['mensal', 'semanal', 'diaria']).nullish(),
  recorrencia_intervalo: z.number().int().min(1).nullish(),
  ocorrencias_total: z.number().int().nullish(),
  ocorrencia_atual: z.number().int().nullish(),
  // Subconjunto de etapas a enviar (cadência configurável); null = ciclo completo.
  cadencia_etapas: z.array(etapaEnvio).nullish(),
  criado_em: z.coerce.date(),
  atualizado_em: z.coerce.date(),
})
export type Aviso = z.infer<typeof avisoSchema>

// Ocorrência de um combinado recorrente (E8 H8.7). O painel usa para o progresso
// "k de N" e o desmembramento por período (H9.6). `confirmado_por` fica de fora da
// entidade pública: o ator de cada transição vem dos eventos (auditoria, H9.4).
export const ocorrenciaSchema = z.object({
  id: z.uuid(),
  aviso_id: z.uuid(),
  indice: z.number().int().min(1),
  data_combinada: dataCombinada,
  status: statusAviso,
  confirmado_em: z.coerce.date().nullable(),
  criado_em: z.coerce.date(),
})
export type Ocorrencia = z.infer<typeof ocorrenciaSchema>

export const envioSchema = z.object({
  id: z.uuid(),
  aviso_id: z.uuid(),
  // Ocorrência à qual o envio pertence (E8 H8.7); null no combinado simples.
  ocorrencia_id: z.uuid().nullish(),
  etapa: etapaEnvio,
  status: statusEnvio,
  agendado_para: z.coerce.date(),
  enviado_em: z.coerce.date().nullable(),
  tentativas: z.number().int().min(0),
  proxima_tentativa_em: z.coerce.date().nullable(),
  wamid: z.string().nullable(),
  entrega_status: entregaStatus.nullable(),
  erro: z.string().nullable(),
})
export type Envio = z.infer<typeof envioSchema>

export const eventoAvisoSchema = z.object({
  id: z.number().int(),
  aviso_id: z.uuid(),
  tipo: tipoEvento,
  ator: atorEvento,
  detalhes: z.record(z.string(), z.unknown()).nullable(),
  criado_em: z.coerce.date(),
})
export type EventoAviso = z.infer<typeof eventoAvisoSchema>

// ---- Templates UNIFICADOS (tabela `templates`, chaveada por `chave`) ----
// Conteúdo ESTRUTURADO que o transporte do zap entende. O texto usa {{1}}..{{n}}
// (resolvidos na ordem de `variaveis`); cada botão tem `acao` (comportamento, no
// código) e `rotulo` (editável); mídia opcional. Espelha o jsonb `conteudo`.
export const botaoTemplate = z.object({
  acao: acaoBotaoTemplate,
  rotulo: z.string().trim().min(1).max(40),
})
export type BotaoTemplate = z.infer<typeof botaoTemplate>

export const midiaTemplate = z.object({
  tipo: tipoMidiaTemplate,
  url: z.url().max(2000),
})
export type MidiaTemplate = z.infer<typeof midiaTemplate>

export const conteudoTemplate = z.object({
  texto: z.string().max(4000).default(''),
  botoes: z.array(botaoTemplate).max(3).optional(),
  midia: midiaTemplate.optional(),
})
export type ConteudoTemplate = z.infer<typeof conteudoTemplate>

export const templateSchema = z.object({
  id: z.uuid(),
  chave: z.string().min(1).max(80),
  contexto: contextoTemplate,
  nome_meta: z.string().min(1).max(120),
  idioma: z.string(),
  conteudo: conteudoTemplate,
  variaveis: z.array(z.string()),
  versao: z.number().int().positive(),
  status_meta: statusMetaTemplate,
  ativo: z.boolean(),
  criado_em: z.coerce.date(),
})
export type Template = z.infer<typeof templateSchema>
