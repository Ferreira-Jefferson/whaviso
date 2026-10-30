// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Tabelas: eval_suites, eval_casos, eval_execucoes (escrita), eval_resultados (so leitura; o
// runner do atendente grava), lojas (id, nome). Colunas sempre explicitas.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type {
  EvalCaso, EvalExecucao, EvalExecucaoFiltro, EvalResultado, EvalSuite, EvalTipo,
} from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

const COLS_SUITE = sql`id, nome, tipo, familia, descricao, ativo,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`
const COLS_CASO = sql`id, suite_id, nome, entrada, esperado, peso::float8 as peso, ativo, origem,
  ${TS('criado_em')} as criado_em`
const COLS_EXEC = sql`id, suite_id, loja_alvo_id, modelo, provedor, config, status, baseline_execucao_id,
  resumo, erro, disparada_por, ${TS('criada_em')} as criada_em, ${TS('iniciada_em')} as iniciada_em,
  ${TS('concluida_em')} as concluida_em`

// ---- Suites ---------------------------------------------------------------------------------

export function listarSuites(exec: Executor, ativo?: boolean): Promise<EvalSuite[]> {
  return consultar<EvalSuite>(exec, sql`
    select ${COLS_SUITE} from public.eval_suites
    where (${ativo ?? null}::boolean is null or ativo = ${ativo ?? null}::boolean)
    order by nome, id`)
}

export function buscarSuite(exec: Executor, id: string): Promise<EvalSuite | null> {
  return consultarUm<EvalSuite>(exec, sql`select ${COLS_SUITE} from public.eval_suites where id = ${id}`)
}

export async function criarSuite(
  exec: Executor,
  d: { nome: string; tipo: EvalTipo; familia: string; descricao: string | null },
): Promise<EvalSuite> {
  const r = await consultarUm<EvalSuite>(exec, sql`
    insert into public.eval_suites (nome, tipo, familia, descricao)
    values (${d.nome}, ${d.tipo}, ${d.familia}, ${d.descricao})
    returning ${COLS_SUITE}`)
  return r as EvalSuite
}

export function atualizarSuite(
  exec: Executor,
  id: string,
  d: { nome?: string; familia?: string; descricao?: string | null; ativo?: boolean },
): Promise<EvalSuite | null> {
  return consultarUm<EvalSuite>(exec, sql`
    update public.eval_suites set
      nome = coalesce(${d.nome ?? null}::text, nome),
      familia = coalesce(${d.familia ?? null}::text, familia),
      descricao = case when ${d.descricao !== undefined} then ${d.descricao ?? null}::text else descricao end,
      ativo = coalesce(${d.ativo ?? null}::boolean, ativo)
    where id = ${id}
    returning ${COLS_SUITE}`)
}

// ---- Casos ----------------------------------------------------------------------------------

export function listarCasos(exec: Executor, suiteId: string): Promise<EvalCaso[]> {
  return consultar<EvalCaso>(exec, sql`
    select ${COLS_CASO} from public.eval_casos where suite_id = ${suiteId} order by criado_em, id`)
}

export function buscarCaso(exec: Executor, id: string): Promise<EvalCaso | null> {
  return consultarUm<EvalCaso>(exec, sql`select ${COLS_CASO} from public.eval_casos where id = ${id}`)
}

export async function criarCaso(
  exec: Executor,
  d: { suiteId: string; nome: string; entrada: object; esperado: object; peso: number; origem: string },
): Promise<EvalCaso> {
  const r = await consultarUm<EvalCaso>(exec, sql`
    insert into public.eval_casos (suite_id, nome, entrada, esperado, peso, origem)
    values (${d.suiteId}, ${d.nome}, ${JSON.stringify(d.entrada)}::jsonb, ${JSON.stringify(d.esperado)}::jsonb,
            ${d.peso}, ${d.origem})
    returning ${COLS_CASO}`)
  return r as EvalCaso
}

export function atualizarCaso(
  exec: Executor,
  id: string,
  d: { nome?: string; entrada?: object; esperado?: object; peso?: number; ativo?: boolean },
): Promise<EvalCaso | null> {
  return consultarUm<EvalCaso>(exec, sql`
    update public.eval_casos set
      nome = coalesce(${d.nome ?? null}::text, nome),
      entrada = coalesce(${d.entrada ? JSON.stringify(d.entrada) : null}::jsonb, entrada),
      esperado = coalesce(${d.esperado ? JSON.stringify(d.esperado) : null}::jsonb, esperado),
      peso = coalesce(${d.peso ?? null}::numeric, peso),
      ativo = coalesce(${d.ativo ?? null}::boolean, ativo)
    where id = ${id}
    returning ${COLS_CASO}`)
}

// ---- Lojas alvo -----------------------------------------------------------------------------

export function listarLojasAlvo(exec: Executor): Promise<{ id: string; nome: string }[]> {
  return consultar(exec, sql`select id, nome from public.lojas order by nome, id`)
}

export async function lojaExiste(exec: Executor, id: string): Promise<boolean> {
  return (await consultarUm(exec, sql`select 1 as ok from public.lojas where id = ${id}`)) !== null
}

// ---- Execucoes ------------------------------------------------------------------------------

export async function enfileirarExecucao(
  exec: Executor,
  d: { suiteId: string; lojaAlvoId: string; modelo: string | null; provedor: string | null; config: object; disparadaPor: string },
): Promise<EvalExecucao> {
  const r = await consultarUm<EvalExecucao>(exec, sql`
    insert into public.eval_execucoes (suite_id, loja_alvo_id, modelo, provedor, config, status, disparada_por)
    values (${d.suiteId}, ${d.lojaAlvoId}, ${d.modelo}, ${d.provedor}, ${JSON.stringify(d.config)}::jsonb,
            'fila', ${d.disparadaPor})
    returning ${COLS_EXEC}`)
  return r as EvalExecucao
}

export function listarExecucoes(exec: Executor, f: EvalExecucaoFiltro): Promise<EvalExecucao[]> {
  return consultar<EvalExecucao>(exec, sql`
    select ${COLS_EXEC} from public.eval_execucoes
    where (${f.suiteId ?? null}::uuid is null or suite_id = ${f.suiteId ?? null}::uuid)
      and (${f.modelo ?? null}::text is null or modelo = ${f.modelo ?? null}::text)
      and (${f.status ?? null}::text is null or status = ${f.status ?? null}::text)
    order by criada_em desc, id desc
    limit 200`)
}

export function buscarExecucao(exec: Executor, id: string): Promise<EvalExecucao | null> {
  return consultarUm<EvalExecucao>(exec, sql`select ${COLS_EXEC} from public.eval_execucoes where id = ${id}`)
}

export function listarResultados(exec: Executor, execucaoId: string): Promise<EvalResultado[]> {
  return consultar<EvalResultado>(exec, sql`
    select id, execucao_id, caso_id, status, scores, saida, metricas, erro, ${TS('criado_em')} as criado_em
    from public.eval_resultados where execucao_id = ${execucaoId} order by criado_em, id`)
}

export async function nomesDeCasos(exec: Executor, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rs = await consultar<{ id: string; nome: string }>(exec, sql`
    select id, nome from public.eval_casos where id = any(${ids}::uuid[])`)
  return new Map(rs.map((r) => [r.id, r.nome]))
}

export function definirBaseline(exec: Executor, id: string, baselineId: string): Promise<EvalExecucao | null> {
  return consultarUm<EvalExecucao>(exec, sql`
    update public.eval_execucoes set baseline_execucao_id = ${baselineId}
    where id = ${id} returning ${COLS_EXEC}`)
}

/** Cancela so se ainda estiver na fila (atomico: o runner pode ter reivindicado entre a leitura e aqui). */
export function cancelarSeFila(exec: Executor, id: string): Promise<EvalExecucao | null> {
  return consultarUm<EvalExecucao>(exec, sql`
    update public.eval_execucoes set status = 'cancelada', concluida_em = now()
    where id = ${id} and status = 'fila' returning ${COLS_EXEC}`)
}
