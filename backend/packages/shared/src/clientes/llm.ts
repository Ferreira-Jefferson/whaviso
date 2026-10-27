import { z } from 'zod'
import { CredencialResolvidaSchema, type ErroProvedor, type Resultado } from './erros'

// Fronteira ClienteLLM (usada pelo atendente). A credencial e uma CredencialResolvida opaca:
// a implementacao a usa SOMENTE no header de auth (SEC-026), nunca no corpo nem nas mensagens.
// `montarRequisicaoLlm` e o ponto unico que monta o par headers/body, para que isso seja testavel.

export const MensagemLlm = z
  .object({
    papel: z.enum(['system', 'user', 'assistant', 'tool']),
    conteudo: z.string(),
    nome: z.string().optional(),
    toolCallId: z.string().optional(),
  })
  .strict()
export type MensagemLlm = z.infer<typeof MensagemLlm>

export const FerramentaLlm = z
  .object({
    nome: z.string().min(1).max(64),
    descricao: z.string().max(1024),
    /** JSON Schema dos parametros. */
    parametros: z.record(z.string(), z.unknown()),
  })
  .strict()
export type FerramentaLlm = z.infer<typeof FerramentaLlm>

export const FormatoSaida = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('texto') }).strict(),
  z.object({ tipo: z.literal('json'), schema: z.record(z.string(), z.unknown()).optional() }).strict(),
])
export type FormatoSaida = z.infer<typeof FormatoSaida>

const Binario = z.object({ bytes: z.instanceof(Uint8Array), mimeType: z.string().min(1) }).strict()
const Cred = { credencial: CredencialResolvidaSchema }

export const CompletarEntrada = z
  .object({
    ...Cred,
    mensagens: z.array(MensagemLlm).min(1),
    ferramentas: z.array(FerramentaLlm).optional(),
    formatoSaida: FormatoSaida.optional(),
    modelo: z.string().min(1).optional(),
    /** Chave de cenario: so stubs/fakes usam (resposta enlatada). Implementacoes reais ignoram. */
    chaveCenario: z.string().min(1).optional(),
  })
  .strict()
export type CompletarEntrada = z.infer<typeof CompletarEntrada>

export const TranscreverEntrada = z.object({ ...Cred, audio: Binario, idioma: z.string().optional() }).strict()
export type TranscreverEntrada = z.infer<typeof TranscreverEntrada>

export const DescreverImagemEntrada = z
  .object({ ...Cred, imagem: Binario, instrucao: z.string().max(2000).optional() })
  .strict()
export type DescreverImagemEntrada = z.infer<typeof DescreverImagemEntrada>

export const EmbutirEntrada = z
  .object({ ...Cred, textos: z.array(z.string().min(1)).min(1).max(256), modelo: z.string().min(1).optional() })
  .strict()
export type EmbutirEntrada = z.infer<typeof EmbutirEntrada>

/** Uso para o livro-razao `uso_llm` (colunas tokens_in, tokens_out, custo_estimado_centavos). */
export const UsoLlm = z
  .object({
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    custoEstimadoCentavos: z.number().int().nonnegative(),
  })
  .strict()
export type UsoLlm = z.infer<typeof UsoLlm>

export const ChamadaFerramenta = z
  .object({ id: z.string().min(1), nome: z.string().min(1), argumentos: z.record(z.string(), z.unknown()) })
  .strict()
export type ChamadaFerramenta = z.infer<typeof ChamadaFerramenta>

export const RespostaCompletar = z
  .object({
    texto: z.string(),
    chamadasFerramenta: z.array(ChamadaFerramenta),
    modelo: z.string(),
    uso: UsoLlm,
  })
  .strict()
export type RespostaCompletar = z.infer<typeof RespostaCompletar>

export interface RespostaTranscrever {
  texto: string
  uso: UsoLlm
}
export interface RespostaDescreverImagem {
  descricao: string
  uso: UsoLlm
}
export interface RespostaEmbutir {
  vetores: number[][]
  uso: UsoLlm
}

type R<T> = Promise<Resultado<T, ErroProvedor>>

export interface ClienteLLM {
  completar(entrada: CompletarEntrada): R<RespostaCompletar>
  /** STT: audio do cliente final para texto. */
  transcrever(entrada: TranscreverEntrada): R<RespostaTranscrever>
  /** Visao: descreve imagem (ex.: foto de cardapio para importacao). */
  descreverImagem(entrada: DescreverImagemEntrada): R<RespostaDescreverImagem>
  /** Embeddings para RAG. Se RAG.md escolher outro provedor, vira ClienteEmbeddings separado. */
  embutir(entrada: EmbutirEntrada): R<RespostaEmbutir>
}

export interface RequisicaoLlm {
  headers: Record<string, string>
  body: Record<string, unknown>
}

/**
 * Monta a requisicao de `completar`: a credencial vai SO em `headers.authorization`.
 * Toda implementacao real deve usar esta funcao (ou o mesmo contrato) para montar o envio.
 */
export function montarRequisicaoLlm(entrada: CompletarEntrada, modeloPadrao: string): RequisicaoLlm {
  const body: Record<string, unknown> = {
    model: entrada.modelo ?? modeloPadrao,
    messages: entrada.mensagens.map((m) => ({
      role: m.papel,
      content: m.conteudo,
      ...(m.nome ? { name: m.nome } : {}),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
    })),
  }
  if (entrada.ferramentas?.length) {
    body.tools = entrada.ferramentas.map((f) => ({
      type: 'function',
      function: { name: f.nome, description: f.descricao, parameters: f.parametros },
    }))
  }
  if (entrada.formatoSaida?.tipo === 'json') body.response_format = { type: 'json_object' }
  return {
    headers: { authorization: `Bearer ${entrada.credencial.revelar()}`, 'content-type': 'application/json' },
    body,
  }
}
