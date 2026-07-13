// ESPELHO de backend/packages/shared/src/contracts/entidades.ts
// Cópia própria do frontend (standalone). Manter em sincronia com o backend.
import { z } from 'zod'
import {
  acaoBotaoTemplate,
  atorEvento,
  categoriaTemplate,
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
  // perfil nasce com nome '' (trigger) até o onboarding; toleramos vazio (espelha o backend)
  nome: z.string().max(120),
  telefone: telefoneE164.nullable(),
  role: roleUsuario,
  criado_em: z.coerce.date(),
  atualizado_em: z.coerce.date(),
})

// Chave Pix salva do usuário (N por perfil; 1 padrão). Espelha o backend.
export const chavePixSchema = z.object({
  id: z.uuid(),
  tipo: tipoChavePix,
  chave: z.string().max(140),
  rotulo: z.string().max(60).nullable(),
  // Titular + banco da chave (0044): o aviso herda como snapshot. Nullable p/ legadas.
  titular: z.string().max(120).nullable(),
  banco: z.string().max(80).nullable(),
  padrao: z.boolean(),
  arquivada: z.boolean(),
  criado_em: z.coerce.date(),
  atualizado_em: z.coerce.date(),
})
export type ChavePix = z.infer<typeof chavePixSchema>
export type Perfil = z.infer<typeof perfilSchema>

// E16: categoria definida pelo usuário (organização por marca/linha). Espelho do backend.
export const categoriaSchema = z.object({
  id: z.uuid(),
  nome: z.string().min(1).max(40),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  arquivada: z.boolean(),
  criado_em: z.coerce.date(),
  atualizado_em: z.coerce.date(),
})
export type Categoria = z.infer<typeof categoriaSchema>

// Fase A: item OPCIONAL do pedido (composição do que foi vendido). Interno do dono; nunca
// vai ao devedor. Espelha o backend. valor_unit_centavos em centavos, >=0.
export const itemPedidoSchema = z.object({
  descricao: z.string().trim().min(1).max(80),
  qtd: z.number().int().min(1).max(9999),
  valor_unit_centavos: z.number().int().min(0),
})
export type ItemPedido = z.infer<typeof itemPedidoSchema>

export const avisoSchema = z.object({
  id: z.uuid(),
  // nullable: no fluxo invertido o cobrador é convidado e só vincula conta ao aceitar.
  cobrador_id: z.uuid().nullable(),
  devedor_profile_id: z.uuid().nullable(),
  direcao: direcaoAviso,
  criador_papel: papelAviso,
  status: statusAviso,
  nome_devedor: z.string().min(1).max(120),
  telefone_devedor: telefoneE164.nullable(),
  // no invertido, dados do cobrador convidado (denormalizados, sem conta até vincular).
  nome_cobrador: z.string().min(1).max(120).nullable(),
  telefone_cobrador: telefoneE164.nullable(),
  motivo: motivoAviso,
  valor_centavos: valorCentavos,
  data_combinada: dataCombinada,
  pix_chave: z.string().max(140).nullable(),
  // Titular + banco da chave Pix (compõem a 2ª msg do Pix ao devedor, E7 H7.3).
  pix_titular: z.string().max(120).nullable(),
  pix_banco: z.string().max(80).nullable(),
  // E16 / Fase A: categoria (opcional) e custo interno do combinado. nullish: nem toda
  // projeção do Aviso os traz. Nunca vão ao devedor; habilitam organização e resultado.
  categoria_id: z.uuid().nullish(),
  valor_custo_centavos: z.number().int().min(0).nullish(),
  // Fase A: composição opcional do pedido (itens). Interno; nunca vai ao devedor. nullish:
  // nem toda projeção do Aviso a traz (a lista por período não seleciona a coluna).
  itens: z.array(itemPedidoSchema).nullish(),
  aceito_em: z.coerce.date().nullable(),
  // Arquivamento da agenda (H11.4): quando preenchido, a anotação saiu da agenda.
  arquivado_em: z.coerce.date().nullable(),
  // Recorrência (E6 H6.10 / E8 H8.7): combinado SIMPLES = tudo null. Quando recorrente,
  // o combinado segue UMA linha; as ocorrências vivem em aviso_ocorrencias. `ocorrencia_atual`
  // é o ponteiro 1..N; o status do aviso reflete a ocorrência corrente (pago só no fim).
  // O painel usa ocorrencia_atual/ocorrencias_total para o progresso "k de N".
  recorrencia_tipo: z.enum(['periodo', 'avulsas']).nullish(),
  recorrencia_freq: z.enum(['mensal', 'semanal']).nullish(),
  // Coluna legada (H6.10): a entrada não configura mais "a cada N"; é sempre 1.
  recorrencia_intervalo: z.number().int().min(1).nullish(),
  ocorrencias_total: z.number().int().nullish(),
  ocorrencia_atual: z.number().int().nullish(),
  // Subconjunto de etapas a enviar (cadência configurável); null = ciclo completo.
  cadencia_etapas: z.array(etapaEnvio).nullish(),
  criado_em: z.coerce.date(),
  atualizado_em: z.coerce.date(),
})
export type Aviso = z.infer<typeof avisoSchema>

// Ocorrência de um combinado recorrente (E8 H8.7). O painel usaria para o progresso
// "k de N" e o desmembramento por período; hoje o front só consome ocorrencia_atual/
// ocorrencias_total do aviso (a api ainda não expõe a coleção de ocorrências por aviso).
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
// Conteúdo ESTRUTURADO que o transporte do zap entende. Texto usa {{1}}..{{n}};
// cada botão tem `acao` (comportamento, no código) e `rotulo` (editável); mídia
// opcional. Espelha o backend (manter em sincronia).
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
  // Ciclo de submissão à Meta (espelha o backend 0066).
  categoria: categoriaTemplate.default('UTILITY'),
  meta_template_id: z.string().nullable().default(null),
  meta_submetido_em: z.coerce.date().nullable().default(null),
  meta_motivo: z.string().nullable().default(null),
  exemplos: z.record(z.string(), z.string()).default({}),
})
export type Template = z.infer<typeof templateSchema>
