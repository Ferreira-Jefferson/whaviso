// Avaliacao de qualidade do retrieval (RAG.md 5). Separa as duas falhas possiveis: ou o retrieval
// nao trouxe o trecho certo (metricas deterministicas, baratas, NO GATE), ou trouxe e o modelo
// respondeu mal (faithfulness por LLM-judge, caro/nao-determinista, AMOSTRADO FORA DO GATE).
//
//   RAG-EVAL-001 (gate): hit@k e context recall sobre o golden set `base_avaliacao` da loja, por
//                        comparacao de ids de documento (sem LLM). Regressao barra o merge.
//   RAG-EVAL-002 (fora): faithfulness/relevance amostrado; aqui so o esqueleto do job.
import { consultar, sql, type Executor } from '@whaviso/shared/db'
import { buscarConhecimento, type DepsRetriever } from './retriever'

export interface CasoAvaliacao {
  pergunta: string
  docsEsperados: string[]
}

export interface ResultadoHitAtK {
  casos: number
  /** Fracao de casos com ao menos um documento esperado entre os k recuperados (hit@k). */
  hitAtK: number
  /** Media, por caso, da fracao de documentos esperados efetivamente recuperados (context recall). */
  contextRecall: number
}

/** Le o golden set ativo da loja. */
export async function lerGoldenSet(exec: Executor, lojaId: string): Promise<CasoAvaliacao[]> {
  const linhas = await consultar<{ pergunta: string; docs_esperados: string[] }>(
    exec,
    sql`select pergunta, docs_esperados from public.base_avaliacao
         where loja_id = ${lojaId} and ativo order by criado_em`,
  )
  return linhas.map((l) => ({ pergunta: l.pergunta, docsEsperados: l.docs_esperados ?? [] }))
}

/**
 * hit@k e context recall sobre o golden set da loja. Determinista (so compara ids). Casos sem
 * documento esperado sao ignorados (nao ha o que acertar). k = tamanho do contexto recuperado.
 */
export async function avaliarHitAtK(
  deps: DepsRetriever,
  lojaId: string,
  k = 4,
): Promise<ResultadoHitAtK> {
  const casos = (await lerGoldenSet(deps.exec, lojaId)).filter((c) => c.docsEsperados.length > 0)
  if (casos.length === 0) return { casos: 0, hitAtK: 0, contextRecall: 0 }

  let hits = 0
  let somaRecall = 0
  for (const caso of casos) {
    const trechos = await buscarConhecimento(deps, { lojaId, consulta: caso.pergunta, contexto: k })
    const recuperados = new Set(trechos.map((t) => t.documentoId))
    const encontrados = caso.docsEsperados.filter((d) => recuperados.has(d))
    if (encontrados.length > 0) hits++
    somaRecall += encontrados.length / caso.docsEsperados.length
  }
  return { casos: casos.length, hitAtK: hits / casos.length, contextRecall: somaRecall / casos.length }
}

/**
 * RAG-EVAL-002 (esqueleto, FORA do gate): faithfulness/relevance por LLM-judge, amostrado, noturno.
 * Nao implementado nesta onda (caro e nao-determinista); documentado para o job de monitoramento.
 */
export interface EntradaFaithfulness {
  pergunta: string
  respostaGerada: string
  trechos: string[]
}
export function avaliarFaithfulness(_e: EntradaFaithfulness): never {
  throw new Error('RAG-EVAL-002 (faithfulness) e job amostrado fora do gate; nao implementado nesta onda')
}
