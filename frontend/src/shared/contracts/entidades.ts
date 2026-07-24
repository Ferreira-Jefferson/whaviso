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
  type StatusAviso,
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

// E17: produto do catálogo (nome + preço de venda). Interno do dono; nunca vai ao devedor.
// Sem custo, sem categoria. Espelha o backend.
export const produtoSchema = z.object({
  id: z.uuid(),
  nome: z.string().min(1).max(80),
  preco_venda_centavos: z.number().int().min(0),
  arquivado: z.boolean(),
  criado_em: z.coerce.date(),
  atualizado_em: z.coerce.date(),
})
export type Produto = z.infer<typeof produtoSchema>

// Fase A: item OPCIONAL do pedido (composição do que foi vendido). Interno do dono; nunca
// vai ao devedor. Espelha o backend. valor_unit_centavos em centavos, >=0. E17: `produto_id`
// (opcional) vincula ao catálogo; descrição/preço são snapshot congelado. null = item avulso.
export const itemPedidoSchema = z.object({
  descricao: z.string().trim().min(1).max(80),
  qtd: z.number().int().min(1).max(9999),
  valor_unit_centavos: z.number().int().min(0),
  produto_id: z.uuid().nullish(),
})
export type ItemPedido = z.infer<typeof itemPedidoSchema>

// O valor do combinado é DERIVADO dos itens (soma de qtd x preço unitário), em centavos.
// Espelha o helper do backend; usado no form para exibir o total e montar o payload.
export function somaItensCentavos(itens: ReadonlyArray<ItemPedido>): number {
  return itens.reduce((s, i) => s + i.qtd * i.valor_unit_centavos, 0)
}

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
  // E16 (multi) / Fase A: categorias (0..N) e custo interno do combinado. nullish: nem toda
  // projeção do Aviso os traz. Nunca vão ao devedor; habilitam organização e resultado.
  categoria_ids: z.array(z.uuid()).nullish(),
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

// ---- Item 7 (migrations 0092/0093/0102, grupo 1B): reporte de dado incorreto ----------
// Campo do combinado que o DEVEDOR apontou como incorreto ao aceitar/interagir pelo
// WhatsApp (valor, data, nome ou motivo, cada um seu próprio campo; chave Pix NÃO entra,
// tem sinal próprio). Espelha o CHECK de `avisos_reportes.campo` no backend. O schema de
// resposta das rotas POST /avisos/:id/aprovar-dado-incorreto e /recusar-dado-incorreto
// vive LOCAL em backend/apps/api/src/modules/avisos/index.ts nesta rodada (o contrato
// geral do Aviso ainda não carrega reporte/código, ver nota abaixo); este tipo aqui é o
// espelho para o front consumir a mesma forma.
export const campoReporteAviso = z.enum(['valor', 'data', 'nome', 'motivo'])
export type CampoReporteAviso = z.infer<typeof campoReporteAviso>

export const avisoReporteSchema = z.object({
  campo: campoReporteAviso,
  // Valores que o devedor informou como CORRETOS ao reportar (formato depende de `campo`).
  dados: z.object({
    valor_centavos: z.number().int().positive().nullish(),
    data_combinada: z.string().nullish(),
    nome_devedor: z.string().nullish(),
    motivo: z.string().nullish(),
  }),
})
export type AvisoReporte = z.infer<typeof avisoReporteSchema>

export const resolverReporteResposta = z.object({
  aviso: avisoSchema,
  reporte: avisoReporteSchema,
})
export type ResolverReporteResposta = z.infer<typeof resolverReporteResposta>

// Item 7 (migration 0092): o novo status já está em `statusAviso` (enums.ts) e portanto
// em `Aviso['status']`. Mantemos esta constante só para quem prefere comparar por nome
// em vez de literal solto (StatusBadge.tsx e shared/format já têm entrada para o valor).
export const STATUS_AGUARDANDO_APROVACAO_DADO_INCORRETO = 'aguardando_aprovacao_dado_incorreto' as const satisfies StatusAviso

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
