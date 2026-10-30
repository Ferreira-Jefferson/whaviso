// Avaliacao de qualidade do retrieval (RAG.md 5). Separa as duas falhas possiveis: ou o retrieval
// nao trouxe o trecho certo (metricas deterministicas, baratas, NO GATE), ou trouxe e o modelo
// respondeu mal (faithfulness por LLM-judge, caro/nao-determinista, AMOSTRADO FORA DO GATE).
//
//   RAG-EVAL-001 (gate): hit@k e context recall sobre o golden set `base_avaliacao` da loja, por
//                        comparacao de ids de documento (sem LLM). Regressao barra o merge.
//   RAG-EVAL-002 (fora): faithfulness por LLM-judge, rodado pelo runner de evals (Central de Evals).
import { consultar, sql, type Executor } from '@whaviso/shared/db'
import { ok, type ErroProvedor, type Resultado, type UsoLlm } from '@whaviso/shared/clientes'
import { idLoja, type Escopo } from '../escopo'
import type { ServicoLlm } from '../llm_client'
import { montarMensagensJuiz, SaidaJuiz, VEREDITOS_JUIZ } from './juiz_prompt'
import { buscarConhecimento, type DepsRetriever } from './retriever'

export const ORIGEM_JUIZ = 'eval_juiz'

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
export async function lerGoldenSet(exec: Executor, escopo: Escopo): Promise<CasoAvaliacao[]> {
  const linhas = await consultar<{ pergunta: string; docs_esperados: string[] }>(
    exec,
    sql`select pergunta, docs_esperados from public.base_avaliacao
         where loja_id = ${idLoja(escopo)} and ativo order by criado_em`,
  )
  return linhas.map((l) => ({ pergunta: l.pergunta, docsEsperados: l.docs_esperados ?? [] }))
}

/**
 * hit@k e context recall sobre o golden set da loja. Determinista (so compara ids). Casos sem
 * documento esperado sao ignorados (nao ha o que acertar). k = tamanho do contexto recuperado.
 */
export async function avaliarHitAtK(
  deps: DepsRetriever,
  escopo: Escopo,
  k = 4,
): Promise<ResultadoHitAtK> {
  const casos = (await lerGoldenSet(deps.exec, escopo)).filter((c) => c.docsEsperados.length > 0)
  if (casos.length === 0) return { casos: 0, hitAtK: 0, contextRecall: 0 }

  let hits = 0
  let somaRecall = 0
  for (const caso of casos) {
    const trechos = await buscarConhecimento(deps, { escopo, consulta: caso.pergunta, contexto: k })
    const recuperados = new Set(trechos.map((t) => t.documentoId))
    const encontrados = caso.docsEsperados.filter((d) => recuperados.has(d))
    if (encontrados.length > 0) hits++
    somaRecall += encontrados.length / caso.docsEsperados.length
  }
  return { casos: casos.length, hitAtK: hits / casos.length, contextRecall: somaRecall / casos.length }
}

/** Entrada do juiz: o que foi perguntado, o que o modelo respondeu e os trechos que ele tinha. */
export interface EntradaFaithfulness {
  pergunta: string
  respostaGerada: string
  trechos: string[]
  /** Modelo do juiz (ideal: familia diferente da do gerador, para nao se auto-favorecer). */
  modeloJuiz?: string
}

export type VereditoFaithfulness = (typeof VEREDITOS_JUIZ)[number]

export interface ResultadoFaithfulness {
  veredito: VereditoFaithfulness
  /** fiel=1, parcial=0.5, infiel=0; `null` quando o juiz respondeu `incerto` (nao entra na media). */
  score: number | null
  justificativa: string
  uso: UsoLlm
}

export interface DepsJuiz {
  servico: ServicoLlm
  exec: Executor
}

const SCORE_POR_VEREDITO: Record<VereditoFaithfulness, number | null> = { fiel: 1, parcial: 0.5, infiel: 0, incerto: null }

/**
 * RAG-EVAL-002: faithfulness por LLM-judge (caro, nao-determinista; roda no runner de evals, fora do
 * gate). A credencial/uso sao da loja do `escopo` (a chave dela paga o juiz). Nunca lanca: o erro do
 * provedor volta no Resultado.
 */
export async function avaliarFaithfulness(
  deps: DepsJuiz,
  escopo: Escopo,
  e: EntradaFaithfulness,
): Promise<Resultado<ResultadoFaithfulness, ErroProvedor>> {
  const r = await deps.servico.completarEstruturado(
    {
      exec: deps.exec,
      escopo,
      origem: ORIGEM_JUIZ,
      mensagens: montarMensagensJuiz(e),
      ...(e.modeloJuiz ? { modelo: e.modeloJuiz } : {}),
    },
    SaidaJuiz,
  )
  if (!r.ok) return r
  const { veredito, justificativa } = r.valor.dados
  return ok({ veredito, score: SCORE_POR_VEREDITO[veredito], justificativa, uso: r.valor.resposta.uso })
}
