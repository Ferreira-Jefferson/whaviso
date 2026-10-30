// Executor rag_retrieval: deterministico, sem LLM de geracao. hit@k e context recall do golden set
// (base_avaliacao) da loja alvo, mais UMA linha por pergunta (caso_id nulo). Sem a extensao vector o
// retriever ja degrada para BM25.
import { avaliarHitAtK, buscarConhecimento, lerGoldenSet } from '../shared/rag'
import { codigoDoErro, resultadoErro, type ExecutorEval } from './tipos'

export const executarRagRetrieval: ExecutorEval = async (ctx) => {
  const { rag, escopo, config } = ctx
  const agregado = await avaliarHitAtK(rag, escopo, config.k)
  const golden = (await lerGoldenSet(rag.exec, escopo)).filter((c) => c.docsEsperados.length > 0)

  for (const caso of golden) {
    try {
      const trechos = await buscarConhecimento(rag, { escopo, consulta: caso.pergunta, contexto: config.k })
      const recuperados = [...new Set(trechos.map((t) => t.documentoId))]
      const achados = caso.docsEsperados.filter((d) => recuperados.includes(d))
      const hit = achados.length > 0 ? 1 : 0
      await ctx.emitir({
        casoId: null,
        status: hit ? 'passou' : 'falhou',
        scores: { hit, recall: achados.length / caso.docsEsperados.length },
        principal: hit,
        peso: 1,
        saida: { pergunta: caso.pergunta, docsEsperados: caso.docsEsperados, docsRecuperados: recuperados },
        metricas: { tokensIn: 0, tokensOut: 0, custoCentavos: 0 },
        erro: null,
      })
    } catch (e) {
      ctx.logger.warn({ err: e }, 'eval rag_retrieval: pergunta falhou')
      await ctx.emitir(resultadoErro(null, 1, codigoDoErro(e)))
    }
  }
  return { porMetricaExtra: { hitAtK: agregado.hitAtK, contextRecall: agregado.contextRecall } }
}
