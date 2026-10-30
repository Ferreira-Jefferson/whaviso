// Executor nlu_intencao: roda o entender_mensagem REAL (LLM da loja alvo + ancoragem ao cardapio) e
// compara a intencao prevista com o esperado. Passou = todos os checks presentes no esperado.
import { consultar, sql } from '@whaviso/shared/db'
import { EvalEntradaNlu, EvalEsperadoNlu } from '@whaviso/shared/contracts'
import { idLoja } from '../shared/escopo'
import { criarEntendedor, normalizar, type ItemCardapio, type ResultadoEntendimento } from '../modules/entender_mensagem'
import { codigoDoErro, resultadoErro, type CasoEval, type ContextoEval, type ExecutorEval, type ResultadoCaso } from './tipos'

export async function lerItensDaLoja(ctx: ContextoEval): Promise<ItemCardapio[]> {
  return consultar<ItemCardapio>(
    ctx.exec,
    sql`select id, nome from public.itens where loja_id = ${idLoja(ctx.escopo)} and ativo order by ordem`,
  )
}

interface Previsto {
  tipo: string
  foraDeEscopo: boolean
  ancorado: { itemId: string; nome: string } | null
}

function prever(r: ResultadoEntendimento): Previsto | null {
  switch (r.estado) {
    case 'entendido': {
      const a = 'itemAncorado' in r.intencao ? r.intencao.itemAncorado : undefined
      return {
        tipo: r.intencao.tipo,
        foraDeEscopo: r.foraDeEscopo,
        ancorado: a && a.estado === 'ancorado' ? { itemId: a.itemId, nome: a.nome } : null,
      }
    }
    case 'baixa_confianca':
      return { tipo: r.intencao.tipo, foraDeEscopo: r.foraDeEscopo, ancorado: null }
    case 'esclarecer':
      return { tipo: 'esclarecer', foraDeEscopo: false, ancorado: null }
    case 'sem_llm':
      return null
  }
}

/** Pura: compara o previsto com o esperado (testavel sem LLM). */
export function compararNlu(p: Previsto, esperado: ReturnType<typeof EvalEsperadoNlu.parse>): { scores: Record<string, number>; passou: boolean } {
  const scores: Record<string, number> = { intentMatch: p.tipo === esperado.tipo ? 1 : 0 }
  if (esperado.foraDeEscopo !== undefined) scores.escopoMatch = p.foraDeEscopo === esperado.foraDeEscopo ? 1 : 0
  if (esperado.itens && esperado.itens.length > 0) {
    const achados = esperado.itens.filter(
      (e) => p.ancorado && (p.ancorado.itemId === e || normalizar(p.ancorado.nome) === normalizar(e)),
    ).length
    scores.itensMatch = achados / esperado.itens.length
  }
  const valores = Object.values(scores)
  return { scores, passou: valores.every((v) => v === 1) }
}

export const executarNluIntencao: ExecutorEval = async (ctx, casos) => {
  const entendedor = criarEntendedor({ servico: ctx.servico, logger: ctx.logger })
  const itens = await lerItensDaLoja(ctx)
  for (const caso of casos) await ctx.emitir(await avaliarCaso(ctx, entendedor, itens, caso))
  return {}
}

async function avaliarCaso(
  ctx: ContextoEval,
  entendedor: ReturnType<typeof criarEntendedor>,
  itens: ItemCardapio[],
  caso: CasoEval,
): Promise<ResultadoCaso> {
  try {
    const entrada = EvalEntradaNlu.parse(caso.entrada)
    const esperado = EvalEsperadoNlu.parse(caso.esperado)
    ctx.tomarUso()
    const t0 = Date.now()
    const r = await entendedor.entender({
      exec: ctx.exec,
      escopo: ctx.escopo,
      mensagem: { tipo: 'texto', texto: entrada.texto },
      cardapio: { itens },
    })
    const latenciaMs = Date.now() - t0
    const uso = ctx.tomarUso()
    const previsto = prever(r)
    if (!previsto) return { ...resultadoErro(caso.id, caso.peso, `sem_llm_${r.estado === 'sem_llm' ? r.motivo : 'indisponivel'}`), metricas: { ...uso, latenciaMs } }
    const { scores, passou } = compararNlu(previsto, esperado)
    return {
      casoId: caso.id,
      status: passou ? 'passou' : 'falhou',
      scores,
      principal: Object.values(scores).reduce((s, v) => s + v, 0) / Object.values(scores).length,
      peso: caso.peso,
      saida: { intencaoPrevista: previsto.tipo, foraDeEscopo: previsto.foraDeEscopo, itemAncorado: previsto.ancorado?.nome ?? null, estado: r.estado, esperado },
      metricas: { ...uso, latenciaMs },
      erro: null,
    }
  } catch (e) {
    ctx.logger.warn({ caso_id: caso.id, err: e }, 'eval nlu_intencao: caso falhou')
    return resultadoErro(caso.id, caso.peso, codigoDoErro(e))
  }
}
