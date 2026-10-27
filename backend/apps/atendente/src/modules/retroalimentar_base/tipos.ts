// Tipos e constantes de retroalimentar_base (AT-realimentar): o PRODUTOR do loop de realimentacao do
// RAG. Principio (RAG.md 3): producao automatica, promocao manual. Este modulo OBSERVA conversas e
// gera RASCUNHOS de documento; nada e embeddado nem indexado sem aprovacao do dono (que vive na api).
//
// A saida do modelo e sempre DADO validado por Zod (SEC-061): nunca vira acao, preco ou mensagem.
// O modulo NUNCA grava status='aprovado' nem chunks: aprovacao e do dono (api), ingestao e do rag.
import { z } from 'zod'

/** Modulo chamador gravado em `uso_llm.origem` (tipo_uso fica no default 'geracao'). */
export const ORIGEM_LLM = 'retroalimentar_base'

/** Tipos de evento (append-only, sem PII) emitidos no outbox `eventos`, sem acoplar a modulo da api. */
export const EVENTO = {
  /** Para o painel: ha N rascunhos de realimentacao aguardando curadoria. */
  sugestoesPendentes: 'conhecimento.sugestoes_pendentes',
  /** Marca idempotente por sinal: a geracao ja foi tentada (evita re-gastar a chave da loja). */
  rascunhoTentado: 'conhecimento.rascunho_tentado',
  /** TTL: rascunho realimentado que ninguem aprovou em X dias (a api o arquiva; aqui so sinalizamos). */
  rascunhoExpirado: 'conhecimento.rascunho_expirado',
} as const

/** N conversas distintas com a mesma duvida para virar sinal recorrente (RAG.md 3; calibravel). */
export const N_RECORRENCIA = 3

/** TTL do rascunho nao aprovado, em dias (RAG.md 3: "o que ninguem aprova em X dias some da fila"). */
export const TTL_RASCUNHO_DIAS = 14

/** Janela de observacao de conversas por lote, em dias (lacuna/correcao/recorrencia). */
export const JANELA_COLETA_DIAS = 7

/** Limiar de similaridade (Jaccard de tokens) para considerar dois textos duplicados no dedup. */
export const LIMIAR_DEDUP = 0.82

/** Tetos por lote (evita rajada; o resto fica para o proximo tick). */
export const MAX_SINAIS_POR_LOTE = 50
export const MAX_RASCUNHOS_POR_LOTE = 20

/** Comprimento minimo do corpo do rascunho (antilixo: abaixo disso, descarta). */
export const MIN_CORPO_CARACTERES = 12

/** Tipo de sinal da fila de realimentacao (espelha o enum `rag_feedback_tipo` da 0018). */
export type SinalTipo = 'lacuna' | 'recorrente' | 'correcao_humana'

/** Tipo de documento (espelha o enum `documento_tipo` da 0018). */
export type DocumentoTipo = 'descricao' | 'regra' | 'faq' | 'politica'

/**
 * Contrato do kernel: candidato a conhecimento. E o que o modulo persiste como `documentos`
 * status='rascunho', origem='realimentado'. Nunca carrega PII (a anonimizacao roda ANTES do LLM).
 */
export interface CandidatoConhecimento {
  tipo: DocumentoTipo
  titulo: string
  corpo: string
  origem: 'realimentado'
  confianca: number
  fonteConversaId: string | null
  fonteMensagemId: string | null
  hashConteudo: string
}

/**
 * Saida estruturada do LLM, validada por Zod (SEC-061). `util=false` = nao ha conhecimento ESTAVEL a
 * registrar (antilixo). O prompt proibe inventar: so reescreve o que esta na pergunta/resposta humana.
 */
export const RascunhoGerado = z.object({
  util: z.boolean(),
  tipo: z.enum(['descricao', 'regra', 'faq', 'politica']),
  titulo: z.string().min(1).max(120),
  corpo: z.string().min(1).max(2000),
  confianca: z.number().min(0).max(1),
})
export type RascunhoGerado = z.infer<typeof RascunhoGerado>

/** Um sinal coletado, pronto para enfileirar em `rag_feedback` (texto ja anonimizado). */
export interface SinalColetado {
  lojaId: string
  tipo: SinalTipo
  conversaId: string | null
  mensagemId: string | null
  /** Texto generico e ANONIMIZADO (sem telefone/nome/endereco). */
  texto: string
  ocorrencias: number
}

/** Resumo de um lote de coleta de sinais. */
export interface ResumoColeta {
  lacunas: number
  correcoes: number
  recorrentes: number
}

/** Desfecho da geracao de UM rascunho (para o resumo e os testes). */
export type DesfechoRascunho = 'rascunho' | 'descartado' | 'duplicado' | 'dado_vivo' | 'sem_llm' | 'erro'

/** Resumo de um lote de geracao de rascunhos. */
export interface ResumoGeracao {
  rascunhos: number
  descartados: number
  duplicados: number
  dadoVivo: number
  semLlm: number
  erros: number
}

/** Resumo do ciclo completo (coleta + geracao + TTL). */
export interface ResumoRetroalimentacao {
  coleta: ResumoColeta
  geracao: ResumoGeracao
  expirados: number
}
