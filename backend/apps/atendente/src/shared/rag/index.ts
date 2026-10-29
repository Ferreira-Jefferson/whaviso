// Kernel de RAG do atendente (AT-rag): retrieval hibrido escopado por loja, ingestao de documento
// aprovado, cache semantico travado e avaliacao. Fonte do desenho: docs/pivot/RAG.md.
//
// `buscarConhecimento` e a unica porta de leitura da base (AT-tools a envolvera numa ToolContract). O
// escopo e SEMPRE por loja_id resolvido no servidor; embedding/rerank usam a credencial da PLATAFORMA.
// O tipo Escopo vive em ../escopo (costura loja|plataforma).
export type { TrechoRecuperado, DocumentoTipo, DocumentoParaIngestao, ChunkBruto } from './tipos'

export { chunkPorUnidadeLogica } from './chunking'
export { validarConteudoConhecimento, podeCachear, type ResultadoValidacao } from './validador'

export {
  criarClienteEmbeddingsPlataforma,
  chavePlataformaPadrao,
  DIM_EMBEDDING,
  MODELO_EMBEDDING_PADRAO,
  type ClienteEmbeddings,
  type EmbutirRagEntrada,
  type OpcoesClienteEmbeddings,
} from './embeddings'
export { criarClienteEmbeddingsProducao, type OpcoesEmbeddingsProducao } from './producao'
export { criarRerankerNulo, type ClienteReranker } from './reranker'
export { registrarUsoRag, type RegistroUsoRag, type TipoUsoRag } from './uso'

export {
  buscarConhecimento,
  vetorDisponivel,
  _resetVetorCache,
  RRF_K,
  K_CANDIDATOS,
  CONTEXTO_PADRAO,
  PESO_LEXICO,
  PESO_VETOR,
  type DepsRetriever,
  type BuscaEntrada,
} from './retriever'

export { montarContextoRag, TETO_CONTEXTO_CARACTERES, type OpcoesContexto } from './montar_contexto'

export {
  ingerirDocumento,
  type DepsIngestor,
  type ResultadoIngestao,
  type Contextualizador,
} from './ingestor'

export {
  gravarCache,
  consultarCache,
  LIMIAR_SIMILARIDADE,
  TTL_PADRAO_SEGUNDOS,
  type GravarCacheEntrada,
  type ConsultarCacheEntrada,
} from './cache'

export {
  avaliarHitAtK,
  lerGoldenSet,
  avaliarFaithfulness,
  type CasoAvaliacao,
  type ResultadoHitAtK,
  type EntradaFaithfulness,
} from './avaliacao'
