// Executor rag_faithfulness: para cada consulta, recupera o contexto da loja alvo, GERA a resposta
// com o LLM da loja (modelo do sweep) e a pontua com um LLM-JUDGE (avaliarFaithfulness). O juiz usa
// `config.judgeModelo` ou, por padrao, um modelo de familia DIFERENTE da do gerador (evita
// auto-favorecimento). Veredito `incerto` vira erro `juiz_incerto` (nao entra na media).
import { EvalEntradaFaithfulness } from '@whaviso/shared/contracts'
import { OPENROUTER_MODELO_PADRAO } from '../shared/llm_client'
import { avaliarFaithfulness, buscarConhecimento, montarContextoRag } from '../shared/rag'
import { codigoDoErro, resultadoErro, type CasoEval, type ContextoEval, type ExecutorEval, type ResultadoCaso } from './tipos'

/** Juiz com versao pinada, de familia diferente do gerador padrao. */
export const JUIZ_PADRAO = 'google/gemini-2.0-flash-001'
export const JUIZ_ALTERNATIVO = 'openai/gpt-4o-mini'

export function escolherJuiz(judgeModelo: string | undefined, geradorModelo: string | undefined): string {
  if (judgeModelo) return judgeModelo
  const gerador = geradorModelo ?? OPENROUTER_MODELO_PADRAO
  return gerador.startsWith('google/') ? JUIZ_ALTERNATIVO : JUIZ_PADRAO
}

const SISTEMA_GERACAO =
  'Voce e o atendente de um restaurante no WhatsApp. Responda a pergunta do cliente usando SOMENTE o ' +
  'conhecimento da loja fornecido. Se a informacao nao estiver nele, diga que vai chamar uma pessoa da ' +
  'loja. Seja breve e cordial.'

export const executarRagFaithfulness: ExecutorEval = async (ctx, casos) => {
  for (const caso of casos) await ctx.emitir(await avaliarCaso(ctx, caso))
  return {}
}

async function avaliarCaso(ctx: ContextoEval, caso: CasoEval): Promise<ResultadoCaso> {
  try {
    const { consulta } = EvalEntradaFaithfulness.parse(caso.entrada)
    ctx.tomarUso()
    const t0 = Date.now()
    const trechos = await buscarConhecimento(ctx.rag, { escopo: ctx.escopo, consulta, contexto: ctx.config.k })
    const contexto = montarContextoRag(trechos)

    const g = await ctx.servico.completar({
      exec: ctx.exec,
      escopo: ctx.escopo,
      origem: 'eval_geracao',
      mensagens: [
        { papel: 'system', conteudo: contexto ? `${SISTEMA_GERACAO}\n\n${contexto}` : SISTEMA_GERACAO },
        { papel: 'user', conteudo: consulta },
      ],
    })
    if (!g.ok) {
      const metricas = { ...ctx.tomarUso(), latenciaMs: Date.now() - t0 }
      return { ...resultadoErro(caso.id, caso.peso, codigoDoErro(g.erro, 'erro_geracao')), metricas }
    }

    const juiz = escolherJuiz(ctx.config.judgeModelo, ctx.modelo)
    const j = await avaliarFaithfulness({ servico: ctx.servico, exec: ctx.exec }, ctx.escopo, {
      pergunta: consulta,
      respostaGerada: g.valor.texto,
      trechos: trechos.map((t) => t.texto),
      modeloJuiz: juiz,
    })
    const metricas = { ...ctx.tomarUso(), latenciaMs: Date.now() - t0, juizModelo: juiz }
    if (!j.ok) return { ...resultadoErro(caso.id, caso.peso, codigoDoErro(j.erro, 'erro_juiz')), metricas }

    const { veredito, score, justificativa } = j.valor
    const saida = {
      resposta: g.valor.texto,
      trechos: trechos.map((t) => t.chunkId),
      documentos: [...new Set(trechos.map((t) => t.documentoId))],
      veredito,
      justificativa,
    }
    if (score === null) {
      return { casoId: caso.id, status: 'erro', scores: {}, principal: null, peso: caso.peso, saida, metricas, erro: 'juiz_incerto' }
    }
    return {
      casoId: caso.id,
      status: score >= 1 ? 'passou' : 'falhou',
      scores: { faithfulness: score },
      principal: score,
      peso: caso.peso,
      saida,
      metricas,
      erro: null,
    }
  } catch (e) {
    ctx.logger.warn({ caso_id: caso.id, err: e }, 'eval rag_faithfulness: caso falhou')
    return resultadoErro(caso.id, caso.peso, codigoDoErro(e))
  }
}
