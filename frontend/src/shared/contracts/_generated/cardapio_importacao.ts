// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/cardapio_importacao.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda da importacao de cardapio por foto/PDF (fonte unica; o codegen reemite para o
// front). O arquivo vai inline (base64) e a extracao por LLM roda no atendente (assincrona): a api
// so enfileira, expoe o RASCUNHO para revisao e, na aprovacao, devolve o LOTE a criar no cardapio.
// Schemas estritos (SEC-081). Dinheiro em centavos. A saida do modelo e entrada nao confiavel:
// passa por este schema e por aprovacao humana antes de tocar o cardapio (SEC-060/061).
import { z } from 'zod'
import { Centavos, DataHoraIso, UuidSchema } from './primitivos'

/** Teto do arquivo bruto (bytes) e do tamanho aceito do base64 na borda. */
export const IMPORTACAO_ARQUIVO_MAX_BYTES = 10 * 1024 * 1024
// Folga acima do base64 de 10 MB: o teto exato em bytes e checado no servico (413 com codigo proprio).
export const IMPORTACAO_BASE64_MAX_CHARS = 14_500_000

/** fila -> processando -> rascunho_pronto | erro; rascunho_pronto -> aprovada | descartada. */
export const importacaoCardapioStatus = [
  'fila', 'processando', 'rascunho_pronto', 'erro', 'aprovada', 'descartada',
] as const
export const ImportacaoCardapioStatus = z.enum(importacaoCardapioStatus)
export type ImportacaoCardapioStatus = z.infer<typeof ImportacaoCardapioStatus>

export const importacaoTipoArquivo = ['imagem', 'pdf'] as const
export const ImportacaoTipoArquivo = z.enum(importacaoTipoArquivo)
export type ImportacaoTipoArquivo = z.infer<typeof ImportacaoTipoArquivo>

// ---------------------------------------------------------------- rascunho
const nome = z.string().trim().min(1).max(80)
const descricao = z.string().trim().max(500)
const confianca = z.number().min(0).max(1)

export const RascunhoOpcao = z.strictObject({
  nome,
  preco_centavos: Centavos.default(0),
  confianca: confianca.optional(),
})
export type RascunhoOpcao = z.infer<typeof RascunhoOpcao>

export const RascunhoGrupo = z.strictObject({
  nome,
  obrigatorio: z.boolean().default(false),
  max_escolhas: z.number().int().min(1).max(99).nullable().default(null),
  opcoes: z.array(RascunhoOpcao).min(1).max(60),
  confianca: confianca.optional(),
})
export type RascunhoGrupo = z.infer<typeof RascunhoGrupo>

export const RascunhoItem = z.strictObject({
  nome,
  descricao: descricao.nullable().default(null),
  preco_centavos: Centavos.default(0),
  grupos: z.array(RascunhoGrupo).max(10).default([]),
  confianca: confianca.optional(),
})
export type RascunhoItem = z.infer<typeof RascunhoItem>

export const RascunhoCategoria = z.strictObject({
  nome,
  descricao: descricao.nullable().default(null),
  itens: z.array(RascunhoItem).max(200),
  confianca: confianca.optional(),
})
export type RascunhoCategoria = z.infer<typeof RascunhoCategoria>

export const RASCUNHO_MAX_CATEGORIAS = 50
export const RASCUNHO_MAX_ITENS = 500

/** Rascunho estruturado: categorias > itens > grupos > opcoes. Limites defensivos de linhas. */
export const RascunhoCardapio = z
  .strictObject({
    categorias: z.array(RascunhoCategoria).max(RASCUNHO_MAX_CATEGORIAS),
  })
  .refine((r) => r.categorias.reduce((n, c) => n + c.itens.length, 0) <= RASCUNHO_MAX_ITENS, {
    message: `no maximo ${RASCUNHO_MAX_ITENS} itens no rascunho`,
    path: ['categorias'],
  })
export type RascunhoCardapio = z.infer<typeof RascunhoCardapio>

// ---------------------------------------------------------------- entrada
export const ImportacaoCardapioCriar = z.strictObject({
  /** Arquivo inline em base64 (JPEG/PNG/WebP/PDF, ate 10 MB). O tipo vem da assinatura, nao daqui. */
  arquivo_base64: z.string().min(8).max(IMPORTACAO_BASE64_MAX_CHARS),
})
export type ImportacaoCardapioCriar = z.infer<typeof ImportacaoCardapioCriar>

export const ImportacaoCardapioEditar = z.strictObject({ rascunho: RascunhoCardapio })
export type ImportacaoCardapioEditar = z.infer<typeof ImportacaoCardapioEditar>

// ---------------------------------------------------------------- saida
export const ImportacaoCardapioCriada = z.strictObject({
  id: UuidSchema,
  status: ImportacaoCardapioStatus,
  /** true quando o envio repetido reaproveitou um job recente do mesmo arquivo. */
  reaproveitada: z.boolean(),
})
export type ImportacaoCardapioCriada = z.infer<typeof ImportacaoCardapioCriada>

export const ImportacaoCardapioResumo = z.strictObject({
  id: UuidSchema,
  status: ImportacaoCardapioStatus,
  tipo_arquivo: ImportacaoTipoArquivo,
  tamanho_bytes: z.number().int(),
  /** Mensagem fixa por codigo; nunca o texto cru do provedor. */
  erro: z.string().nullable(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type ImportacaoCardapioResumo = z.infer<typeof ImportacaoCardapioResumo>

export const ImportacoesCardapioSaida = z.strictObject({ itens: z.array(ImportacaoCardapioResumo) })

export const ImportacaoCardapioEstado = ImportacaoCardapioResumo.extend({
  rascunho: RascunhoCardapio.nullable(),
})
export type ImportacaoCardapioEstado = z.infer<typeof ImportacaoCardapioEstado>

// ---------------------------------------------------------------- lote (aprovacao)
// Lote a criar no cardapio, no formato das entradas do modulo cardapio (CategoriaCriar, ItemCriar
// sem categoria_id, GrupoCriar sem aplica_a_opcao_id): o cliente/orquestrador cria categoria por
// categoria, item por item e os grupos por item; a importacao nunca escreve nas tabelas do cardapio.
export const CardapioLoteOpcao = z.strictObject({ nome, preco_centavos: Centavos })
export const CardapioLoteGrupo = z.strictObject({
  nome,
  tipo: z.literal('customizado'),
  obrigatorio: z.boolean(),
  min_escolhas: z.number().int().min(0).max(99),
  max_escolhas: z.number().int().min(1).max(99).nullable(),
  opcoes: z.array(CardapioLoteOpcao),
})
export const CardapioLoteItem = z.strictObject({
  nome,
  descricao: descricao.nullable(),
  preco_centavos: Centavos,
  grupos: z.array(CardapioLoteGrupo),
})
export const CardapioLoteCategoria = z.strictObject({
  nome,
  descricao: descricao.nullable(),
  itens: z.array(CardapioLoteItem),
})
export const CardapioLote = z.strictObject({ categorias: z.array(CardapioLoteCategoria) })
export type CardapioLote = z.infer<typeof CardapioLote>

export const ImportacaoCardapioAprovadaSaida = z.strictObject({
  id: UuidSchema,
  status: z.literal('aprovada'),
  lote: CardapioLote,
})
export type ImportacaoCardapioAprovadaSaida = z.infer<typeof ImportacaoCardapioAprovadaSaida>

export const ImportacaoCardapioDescartadaSaida = z.strictObject({
  id: UuidSchema,
  status: z.literal('descartada'),
})
