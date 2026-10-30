// Tipos do runner da Central de Evals (app-root: orquestra o modulo entender_mensagem e o kernel de
// shared/, por isso nao mora em modules/ nem em shared/). Tudo aqui e sem PII e sem segredo.
import type { EvalStatusResultado } from '@whaviso/shared/contracts'
import type { Executor } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import type { Escopo } from '../shared/escopo'
import type { ServicoLlm } from '../shared/llm_client'
import type { DepsRetriever } from '../shared/rag'

export interface CasoEval {
  id: string
  nome: string
  entrada: Record<string, unknown>
  esperado: Record<string, unknown>
  peso: number
}

/** Config da execucao (eval_execucoes.config) ja com defaults seguros. */
export interface ConfigEval {
  /** Trechos no contexto recuperado (k de hit@k / contexto da geracao). */
  k: number
  /** Modelo do juiz de faithfulness; ausente => padrao de familia diferente da do gerador. */
  judgeModelo: string | undefined
}

export interface MetricasEval {
  tokensIn: number
  tokensOut: number
  custoCentavos: number
  latenciaMs?: number
  [extra: string]: unknown
}

export interface ResultadoCaso {
  /** null em rag_retrieval (linha por pergunta do golden set). */
  casoId: string | null
  status: EvalStatusResultado
  scores: Record<string, number>
  /** Score primario do caso (entra no scoreMedio); null quando nao ha (ex.: erro). */
  principal: number | null
  peso: number
  saida: Record<string, unknown> | null
  metricas: MetricasEval | null
  /** Codigo curto e sanitizado (nunca mensagem bruta de excecao). */
  erro: string | null
}

export interface ContextoEval {
  exec: Executor
  logger: Logger
  /** Servico ja envolvido: injeta o modelo do sweep e mede o uso. */
  servico: ServicoLlm
  escopo: Escopo
  rag: DepsRetriever
  /** Modelo do sweep (execucao.modelo), usado como "modelo do gerador" para escolher o juiz. */
  modelo: string | undefined
  config: ConfigEval
  /** Persiste o resultado assim que sai (andamento visivel e a prova de queda). */
  emitir(r: ResultadoCaso): Promise<void>
  /** Soma do uso LLM medido desde a ultima chamada (e zera). */
  tomarUso(): { tokensIn: number; tokensOut: number; custoCentavos: number }
}

/** Retorno de um executor: metricas agregadas extras (ex.: hitAtK/contextRecall). */
export interface RetornoExecutor {
  porMetricaExtra?: Record<string, number>
}

export type ExecutorEval = (ctx: ContextoEval, casos: readonly CasoEval[]) => Promise<RetornoExecutor>

/** Codigo estavel e seguro a partir de qualquer erro: usa `codigo` se houver, senao generico. */
export function codigoDoErro(e: unknown, padrao = 'erro_interno'): string {
  if (e && typeof e === 'object') {
    if ((e as { name?: unknown }).name === 'ZodError') return 'caso_invalido'
    const c = (e as { codigo?: unknown }).codigo
    if (typeof c === 'string' && /^[a-z0-9_]{1,60}$/.test(c)) return c
  }
  return padrao
}

export function resultadoErro(casoId: string | null, peso: number, erro: string): ResultadoCaso {
  return { casoId, status: 'erro', scores: {}, principal: null, peso, saida: null, metricas: null, erro }
}
