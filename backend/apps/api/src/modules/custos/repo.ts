// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// `eventos_custo` nao tem coluna de conteudo (SEC-003): projecoes de colunas explicitas, sem
// `select *`. A visao da loja filtra por loja_id; a do operador agrega a base inteira e nunca
// devolve linha individual nem loja_id. Dias e periodos em America/Sao_Paulo.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { CategoriaCusto, EventoCustoDto, TarifaMetaDto } from './schemas'

const FUSO = 'America/Sao_Paulo'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

/** Filtro de escopo: uma loja (visao da loja) ou nenhum (visao agregada do operador). */
export const ESCOPO_PLATAFORMA: Consulta = sql`true`
export const escopoLoja = (lojaId: string): Consulta => sql`loja_id = ${lojaId}`

export interface Periodo {
  de: string
  ate: string
  dias: number
}

/** Resolve o periodo efetivo (default: ultimos 30 dias ate hoje em Sao Paulo). */
export async function resolverPeriodo(exec: Executor, de?: string, ate?: string): Promise<Periodo> {
  const r = await consultarUm<Periodo>(
    exec,
    sql`with p as (
          select coalesce(${ate ?? null}::date, (now() at time zone ${FUSO})::date) as ate
        ), q as (
          select p.ate, coalesce(${de ?? null}::date, p.ate - 29) as de from p
        )
        select to_char(q.de, 'YYYY-MM-DD') as de, to_char(q.ate, 'YYYY-MM-DD') as ate,
               (q.ate - q.de + 1)::int as dias
          from q`,
  )
  return r!
}

// Limites do periodo como timestamptz: [inicio do dia `de`, inicio do dia seguinte a `ate`).
const noPeriodo = (p: Periodo): Consulta => sql`criado_em >= (${p.de}::date::timestamp at time zone ${FUSO})
  and criado_em < ((${p.ate}::date + 1)::timestamp at time zone ${FUSO})`

const DIA_SP = sqlBruto(`to_char((criado_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')`)

export async function total(exec: Executor, escopo: Consulta, p: Periodo): Promise<number> {
  const r = await consultarUm<{ total: number }>(
    exec,
    sql`select coalesce(sum(valor_centavos), 0)::bigint::int as total
          from public.eventos_custo where ${escopo} and ${noPeriodo(p)}`,
  )
  return r!.total
}

export async function porCategoria(exec: Executor, escopo: Consulta, p: Periodo) {
  return consultar<{ categoria: CategoriaCusto; total_centavos: number; quantidade: number; eventos: number }>(
    exec,
    sql`select categoria::text as categoria,
               coalesce(sum(valor_centavos), 0)::bigint::int as total_centavos,
               coalesce(sum(quantidade), 0)::bigint::int as quantidade,
               count(*)::int as eventos
          from public.eventos_custo where ${escopo} and ${noPeriodo(p)}
         group by 1 order by total_centavos desc, categoria`,
  )
}

export async function porOrigem(exec: Executor, escopo: Consulta, p: Periodo) {
  return consultar<{ origem: string; total_centavos: number }>(
    exec,
    sql`select origem, coalesce(sum(valor_centavos), 0)::bigint::int as total_centavos
          from public.eventos_custo where ${escopo} and ${noPeriodo(p)}
         group by 1 order by total_centavos desc, origem`,
  )
}

export async function porDia(exec: Executor, escopo: Consulta, p: Periodo) {
  return consultar<{ dia: string; total_centavos: number }>(
    exec,
    sql`select ${DIA_SP} as dia, coalesce(sum(valor_centavos), 0)::bigint::int as total_centavos
          from public.eventos_custo where ${escopo} and ${noPeriodo(p)}
         group by 1 order by 1`,
  )
}

/** So no escopo plataforma: lojas distintas com custo e a parcela sem loja. */
export async function metricasPlataforma(exec: Executor, p: Periodo) {
  const r = await consultarUm<{ lojas_com_custo: number; sem_loja_centavos: number }>(
    exec,
    sql`select count(distinct loja_id)::int as lojas_com_custo,
               coalesce(sum(valor_centavos) filter (where loja_id is null), 0)::bigint::int as sem_loja_centavos
          from public.eventos_custo where ${noPeriodo(p)}`,
  )
  return r!
}

export interface FiltroEventos {
  categoria?: CategoriaCusto
  cursor?: { ts: string; id: string }
  limite: number
}

/** Eventos da loja, mais recentes primeiro; pede limite+1 para detectar a proxima pagina. */
export async function listarEventos(exec: Executor, lojaId: string, p: Periodo, f: FiltroEventos) {
  const porCat = f.categoria ? sql` and categoria = ${f.categoria}::categoria_custo` : sqlBruto('')
  const cursor = f.cursor
    ? sql` and (criado_em, id) < (${f.cursor.ts}::timestamptz, ${f.cursor.id}::uuid)`
    : sqlBruto('')
  return consultar<EventoCustoDto & { criado_em_ts: string }>(
    exec,
    sql`select id, categoria::text as categoria, origem, valor_centavos, quantidade, referencia,
               ${TS('criado_em')} as criado_em, ${TS('criado_em')} as criado_em_ts
          from public.eventos_custo
         where loja_id = ${lojaId} and ${noPeriodo(p)}${porCat}${cursor}
         order by criado_em desc, id desc
         limit ${f.limite + 1}`,
  )
}

/** Catalogo de tarifas Meta (mais recente primeiro dentro de pais x categoria). */
export async function listarTarifas(exec: Executor, f: { pais?: string; categoria?: string }) {
  const pais = f.pais ? sql` and pais = ${f.pais}` : sqlBruto('')
  const cat = f.categoria ? sql` and categoria = ${f.categoria}::categoria_tarifa_meta` : sqlBruto('')
  return consultar<TarifaMetaDto>(
    exec,
    sql`select id, pais::text as pais, categoria::text as categoria, valor_centavos,
               to_char(vigencia_inicio, 'YYYY-MM-DD') as vigencia_inicio,
               to_char(vigencia_fim, 'YYYY-MM-DD') as vigencia_fim
          from public.tarifas_meta where true${pais}${cat}
         order by pais, categoria, vigencia_inicio desc`,
  )
}

export interface EventoParaGravar {
  lojaId: string | null
  categoria: CategoriaCusto
  origem: string
  valorCentavos: number
  quantidade: number
  referencia: string | null
  chaveIdempotencia: string | null
}

/**
 * Append no razao. Sem RETURNING (zap/atendente nao tem SELECT) e sem alvo de conflito: um reenvio
 * com a mesma (origem, chave_idempotencia) e ignorado pelo indice unico parcial.
 */
export async function inserir(exec: Executor, e: EventoParaGravar): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos_custo
          (loja_id, categoria, origem, valor_centavos, quantidade, referencia, chave_idempotencia)
        values (${e.lojaId}, ${e.categoria}::categoria_custo, ${e.origem}, ${e.valorCentavos},
                ${e.quantidade}, ${e.referencia}, ${e.chaveIdempotencia})
        on conflict do nothing`,
  )
}
