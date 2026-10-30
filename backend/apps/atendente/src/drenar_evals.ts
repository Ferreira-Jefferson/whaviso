// Runner da Central de Evals (app-root: orquestra o modulo entender_mensagem + o kernel de shared/;
// modulo/shared nao poderiam importar um modulo). Drena `eval_execucoes` em fila, executa a suite
// contra o pipeline REAL (LLM da loja alvo, RAG, harness) e grava um `eval_resultados` por caso e o
// `resumo` agregado.
//
// Claim: uma execucao por transacao (FOR UPDATE SKIP LOCKED), marcada `rodando` e COMMITADA antes de
// executar (visivel no painel; o lock nao dura a execucao). Falha fechada e isolada: erro num caso vira
// resultado `erro`; erro fatal numa execucao vira `falha`; nada derruba o laco. Logs so com ids/codigos
// (nunca prompt, chave, resposta bruta nem dado de cliente).
import { EvalTipo, type EvalTipo as TipoEval } from '@whaviso/shared/contracts'
import { comTransacao, consultar, consultarUm, sql, type Executor, type Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { escopoLoja } from './shared/escopo'
import type { ServicoLlm } from './shared/llm_client'
import type { DepsRetriever } from './shared/rag'
import { executarHarnessTurno } from './evals/harness_turno'
import { executarNluIntencao } from './evals/nlu_intencao'
import { executarRagFaithfulness } from './evals/rag_faithfulness'
import { executarRagRetrieval } from './evals/rag_retrieval'
import { montarResumo } from './evals/resumo'
import { medirServico } from './evals/servico_medido'
import { codigoDoErro, type CasoEval, type ConfigEval, type ContextoEval, type ExecutorEval, type ResultadoCaso } from './evals/tipos'

export const MAX_EXECUCOES_POR_DRENAGEM = 1
/** Execucao `rodando` ha mais que isto sem terminar e considerada interrompida (processo caiu). */
export const TIMEOUT_EXECUCAO_MINUTOS = 120
export const K_PADRAO = 4

export interface DepsEvals {
  pool: Pool
  logger: Logger
  /** Servico de LLM de producao (credencial da loja alvo; o runner injeta modelo e mede uso). */
  servico: ServicoLlm
  rag: DepsRetriever
}

export interface ResumoDrenagemEvals {
  concluidas: number
  falhas: number
}

interface ExecucaoClaim {
  id: string
  suite_id: string
  loja_alvo_id: string
  modelo: string | null
  config: Record<string, unknown> | null
}

export const EXECUTORES: Record<TipoEval, ExecutorEval> = {
  rag_retrieval: executarRagRetrieval,
  rag_faithfulness: executarRagFaithfulness,
  nlu_intencao: executarNluIntencao,
  harness_turno: executarHarnessTurno,
}

/** Config da execucao com defaults seguros (k inteiro 1..20; juiz so se for string nao vazia). */
export function lerConfig(bruta: Record<string, unknown> | null): ConfigEval {
  const k = bruta?.k
  const juiz = bruta?.judgeModelo
  return {
    k: typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= 20 ? k : K_PADRAO,
    judgeModelo: typeof juiz === 'string' && juiz.trim() !== '' && juiz.length <= 120 ? juiz.trim() : undefined,
  }
}

/** Reivindica a proxima execucao em fila e a marca `rodando` (commit imediato). */
export async function reivindicarExecucao(pool: Pool): Promise<ExecucaoClaim | null> {
  return comTransacao(pool, async (tx) => {
    const e = await consultarUm<ExecucaoClaim>(
      tx,
      sql`select id, suite_id, loja_alvo_id, modelo, config
            from public.eval_execucoes
           where status = 'fila'
           order by criada_em
           for update skip locked
           limit 1`,
    )
    if (!e) return null
    await consultar(tx, sql`update public.eval_execucoes set status = 'rodando', iniciada_em = now() where id = ${e.id}`)
    return e
  })
}

/** Marca como falha as execucoes `rodando` ha tempo demais (o processo caiu no meio). */
async function recuperarInterrompidas(deps: DepsEvals): Promise<void> {
  await consultar(
    deps.pool,
    sql`update public.eval_execucoes
           set status = 'falha', erro = 'interrompida', concluida_em = now()
         where status = 'rodando'
           and iniciada_em < now() - make_interval(mins => ${TIMEOUT_EXECUCAO_MINUTOS})`,
  )
}

async function gravarResultado(exec: Executor, execucaoId: string, r: ResultadoCaso): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eval_resultados (execucao_id, caso_id, status, scores, saida, metricas, erro)
        values (${execucaoId}, ${r.casoId}, ${r.status}, ${JSON.stringify(r.scores)}::jsonb,
                ${r.saida ? JSON.stringify(r.saida) : null}::jsonb,
                ${r.metricas ? JSON.stringify(r.metricas) : null}::jsonb, ${r.erro})`,
  )
}

async function carregarCasos(pool: Pool, suiteId: string): Promise<CasoEval[]> {
  return consultar<CasoEval>(
    pool,
    sql`select id, nome, entrada, esperado, peso::float8 as peso
          from public.eval_casos where suite_id = ${suiteId} and ativo order by criado_em, id`,
  )
}

async function falhar(deps: DepsEvals, id: string, erro: string, resumo?: unknown): Promise<void> {
  await consultar(
    deps.pool,
    sql`update public.eval_execucoes
           set status = 'falha', erro = ${erro}, resumo = ${resumo ? JSON.stringify(resumo) : null}::jsonb, concluida_em = now()
         where id = ${id} and status = 'rodando'`,
  )
}

/** Executa uma execucao ja reivindicada. Nunca lanca: qualquer erro fatal vira `falha`. */
export async function executarExecucao(deps: DepsEvals, ex: ExecucaoClaim): Promise<'concluida' | 'falha'> {
  const { pool, logger } = deps
  try {
    const suite = await consultarUm<{ tipo: string }>(pool, sql`select tipo from public.eval_suites where id = ${ex.suite_id}`)
    const tipo = EvalTipo.safeParse(suite?.tipo)
    if (!tipo.success) {
      await falhar(deps, ex.id, 'suite_invalida')
      return 'falha'
    }

    const casos = tipo.data === 'rag_retrieval' ? [] : await carregarCasos(pool, ex.suite_id)
    const medido = medirServico(deps.servico, ex.modelo ?? undefined)
    const resultados: ResultadoCaso[] = []
    const ctx: ContextoEval = {
      exec: pool,
      logger,
      servico: medido.servico,
      escopo: escopoLoja(ex.loja_alvo_id),
      rag: deps.rag,
      modelo: ex.modelo ?? undefined,
      config: lerConfig(ex.config),
      async emitir(r) {
        await gravarResultado(pool, ex.id, r)
        resultados.push(r)
      },
      tomarUso: medido.tomarUso,
    }

    const retorno = await EXECUTORES[tipo.data](ctx, casos)
    const resumo = montarResumo(resultados, retorno.porMetricaExtra)

    if (resumo.total === 0) {
      await falhar(deps, ex.id, tipo.data === 'rag_retrieval' ? 'golden_set_vazio' : 'suite_sem_casos', resumo)
      return 'falha'
    }
    await consultar(
      pool,
      sql`update public.eval_execucoes
             set status = 'concluida', resumo = ${JSON.stringify(resumo)}::jsonb, erro = null, concluida_em = now()
           where id = ${ex.id} and status = 'rodando'`,
    )
    logger.info({ execucao_id: ex.id, loja_id: ex.loja_alvo_id, tipo: tipo.data, total: resumo.total, passou: resumo.passou, erro: resumo.erro }, 'eval concluida')
    return 'concluida'
  } catch (erro) {
    logger.error({ execucao_id: ex.id, err: erro }, 'eval falhou')
    try {
      await falhar(deps, ex.id, codigoDoErro(erro, 'erro_interno'))
    } catch (e2) {
      logger.error({ execucao_id: ex.id, err: e2 }, 'nao foi possivel marcar a eval como falha')
    }
    return 'falha'
  }
}

/** Drena ate `max` execucoes em fila. Nunca lanca. */
export async function drenarEvals(deps: DepsEvals, max = MAX_EXECUCOES_POR_DRENAGEM): Promise<ResumoDrenagemEvals> {
  const resumo: ResumoDrenagemEvals = { concluidas: 0, falhas: 0 }
  try {
    await recuperarInterrompidas(deps)
    for (let i = 0; i < max; i++) {
      const ex = await reivindicarExecucao(deps.pool)
      if (!ex) break
      const r = await executarExecucao(deps, ex)
      if (r === 'concluida') resumo.concluidas++
      else resumo.falhas++
    }
  } catch (erro) {
    deps.logger.error({ err: erro }, 'dreno de evals falhou')
  }
  return resumo
}
