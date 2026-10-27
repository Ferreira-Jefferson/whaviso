// Contratos de borda da curadoria da base de conhecimento (RAG) da loja: documentos versionados
// (rascunho -> aprovado -> arquivado), golden set (base_avaliacao) e triagem da realimentacao
// (rag_feedback). Fonte unica; o codegen reemite para o front. Schemas estritos (SEC-081).
// So conteudo ESTAVEL e textual: dado vivo (preco, disponibilidade, status), telefone/Pix e segredo
// sao barrados no servidor (docs/pivot/RAG.md secao 3). A loja vem SEMPRE do escopo, nunca do corpo.
import { z } from 'zod'
import { DataHoraIso, UuidSchema } from './primitivos'

export const documentoTipos = ['descricao', 'regra', 'faq', 'politica'] as const
export const DocumentoTipo = z.enum(documentoTipos)
export type DocumentoTipo = z.infer<typeof DocumentoTipo>

export const documentoStatusValores = ['rascunho', 'aprovado', 'arquivado'] as const
export const DocumentoStatus = z.enum(documentoStatusValores)
export type DocumentoStatus = z.infer<typeof DocumentoStatus>

export const documentoOrigens = ['manual', 'importado', 'realimentado'] as const
export const DocumentoOrigem = z.enum(documentoOrigens)
export type DocumentoOrigem = z.infer<typeof DocumentoOrigem>

export const ragFeedbackTipos = ['lacuna', 'recorrente', 'correcao_humana'] as const
export const RagFeedbackTipo = z.enum(ragFeedbackTipos)
export type RagFeedbackTipo = z.infer<typeof RagFeedbackTipo>

export const ragFeedbackStatusValores = ['novo', 'triado', 'promovido', 'descartado'] as const
export const RagFeedbackStatus = z.enum(ragFeedbackStatusValores)
export type RagFeedbackStatus = z.infer<typeof RagFeedbackStatus>

const titulo = z.string().trim().min(1).max(120)
const conteudo = z.string().trim().min(1).max(4000)

// ---------------------------------------------------------------- documentos
export const DocumentoCriar = z.strictObject({
  tipo: DocumentoTipo,
  titulo,
  conteudo,
})
export type DocumentoCriar = z.infer<typeof DocumentoCriar>

/** Editar rascunho altera no lugar; editar aprovado cria uma NOVA versao (rascunho). */
export const DocumentoAtualizar = z
  .strictObject({
    tipo: DocumentoTipo.optional(),
    titulo: titulo.optional(),
    conteudo: conteudo.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
export type DocumentoAtualizar = z.infer<typeof DocumentoAtualizar>

export const DocumentosFiltro = z.strictObject({
  status: DocumentoStatus.optional(),
  tipo: DocumentoTipo.optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
})
export type DocumentosFiltro = z.infer<typeof DocumentosFiltro>

export const DocumentoSaida = z.strictObject({
  id: UuidSchema,
  tipo: DocumentoTipo,
  titulo: z.string(),
  conteudo: z.string(),
  status: DocumentoStatus,
  origem: DocumentoOrigem,
  versao: z.number().int(),
  substitui_id: UuidSchema.nullable(),
  fonte_conversa_id: UuidSchema.nullable(),
  fonte_mensagem_id: UuidSchema.nullable(),
  aprovado_em: DataHoraIso.nullable(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
  /** Quantos chunks o atendente ja indexou (0 = ainda nao ingerido ou sem vetor). So leitura. */
  chunks_indexados: z.number().int(),
  /** Outro documento ativo (rascunho/aprovado) com o mesmo conteudo normalizado, se houver. */
  duplicado_de: UuidSchema.nullable(),
})
export type DocumentoSaida = z.infer<typeof DocumentoSaida>

export const DocumentosSaida = z.strictObject({ itens: z.array(DocumentoSaida) })
export type DocumentosSaida = z.infer<typeof DocumentosSaida>

export const DocumentoVersoesSaida = z.strictObject({ versoes: z.array(DocumentoSaida) })
export type DocumentoVersoesSaida = z.infer<typeof DocumentoVersoesSaida>

// ---------------------------------------------------------------- golden set
export const AvaliacaoCriar = z.strictObject({
  pergunta: z.string().trim().min(3).max(500),
  resposta_esperada: z.string().trim().min(1).max(2000).nullish(),
  docs_esperados: z.array(UuidSchema).max(20).default([]),
  tipo: DocumentoTipo.nullish(),
})
export type AvaliacaoCriar = z.infer<typeof AvaliacaoCriar>

export const AvaliacaoAtualizar = z
  .strictObject({
    pergunta: z.string().trim().min(3).max(500).optional(),
    resposta_esperada: z.string().trim().min(1).max(2000).nullable().optional(),
    docs_esperados: z.array(UuidSchema).max(20).optional(),
    tipo: DocumentoTipo.nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
export type AvaliacaoAtualizar = z.infer<typeof AvaliacaoAtualizar>

export const AvaliacaoFiltro = z.strictObject({
  ativo: z.enum(['true', 'false']).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(100),
})
export type AvaliacaoFiltro = z.infer<typeof AvaliacaoFiltro>

export const AvaliacaoGoldenSaida = z.strictObject({
  id: UuidSchema,
  pergunta: z.string(),
  resposta_esperada: z.string().nullable(),
  docs_esperados: z.array(UuidSchema),
  tipo: DocumentoTipo.nullable(),
  ativo: z.boolean(),
  origem: z.string(),
  criado_em: DataHoraIso,
})
export type AvaliacaoGoldenSaida = z.infer<typeof AvaliacaoGoldenSaida>

export const AvaliacoesGoldenSaida = z.strictObject({ itens: z.array(AvaliacaoGoldenSaida) })
export type AvaliacoesGoldenSaida = z.infer<typeof AvaliacoesGoldenSaida>

// ---------------------------------------------------------------- feedback
export const FeedbackFiltro = z.strictObject({
  status: RagFeedbackStatus.optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
})
export type FeedbackFiltro = z.infer<typeof FeedbackFiltro>

export const FeedbackSaida = z.strictObject({
  id: UuidSchema,
  tipo: RagFeedbackTipo,
  texto: z.string(),
  ocorrencias: z.number().int(),
  status: RagFeedbackStatus,
  documento_rascunho_id: UuidSchema.nullable(),
  criado_em: DataHoraIso,
})
export type FeedbackSaida = z.infer<typeof FeedbackSaida>

export const FeedbacksSaida = z.strictObject({ itens: z.array(FeedbackSaida) })
export type FeedbacksSaida = z.infer<typeof FeedbacksSaida>

/** Promover: o dono escreve o documento (o texto cru da conversa nunca vira documento sozinho). */
export const FeedbackPromover = DocumentoCriar
export type FeedbackPromover = z.infer<typeof FeedbackPromover>

export const FeedbackPromovidoSaida = z.strictObject({
  feedback: FeedbackSaida,
  documento: DocumentoSaida,
})
export type FeedbackPromovidoSaida = z.infer<typeof FeedbackPromovidoSaida>
