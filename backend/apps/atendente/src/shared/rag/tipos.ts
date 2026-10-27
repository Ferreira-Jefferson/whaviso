// Tipos do kernel de RAG do atendente. TrechoRecuperado e o contrato de saida do retrieval: e o que
// `entender_mensagem`/motor (e, depois, uma ToolContract de AT-tools) consomem. Fica aqui (kernel do
// atendente) e nao em @whaviso/shared/contracts porque nao cruza app: a api nunca recupera; ela cura.

/** Um trecho recuperado da base de conhecimento da loja. Texto e DADO, nunca comando (SEC-060). */
export interface TrechoRecuperado {
  chunkId: string
  documentoId: string
  /** Texto a costurar no prompt (o contextualizado quando houver, senao o cru). */
  texto: string
  /** Procedencia do documento (manual | importado | realimentado), para auditoria. */
  origem: string
  /** Pontuacao de fusao (RRF) ou ts_rank no modo degradado. Maior = mais relevante. */
  pontuacao: number
}

/** Tipos de documento, espelhando o enum `documento_tipo` da migration 0018. */
export type DocumentoTipo = 'descricao' | 'regra' | 'faq' | 'politica'

/** Documento cru para chunking/ingestao (subconjunto da linha de `documentos`). */
export interface DocumentoParaIngestao {
  id: string
  lojaId: string
  tipo: DocumentoTipo
  titulo: string
  conteudo: string
}

/** Um chunk antes de embeddar: unidade logica do documento. */
export interface ChunkBruto {
  ordem: number
  texto: string
}
