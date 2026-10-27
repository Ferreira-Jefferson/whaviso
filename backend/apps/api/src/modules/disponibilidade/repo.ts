// SQL parametrizado do modulo (SEC-080). Dono de escrita das tres tabelas de disponibilidade.
// Toda consulta filtra por loja_id (multi-tenant). time -> "HH:mm"; date -> "YYYY-MM-DD"; ts -> UTC ISO.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { HorarioSaida, ExcecaoSaida, JanelaAtendenteSaida } from './schemas'
import type { FaixaHorario, Excecao } from './calculo'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)
const HM = (col: string): Consulta => sqlBruto(`to_char(${col}, 'HH24:MI')`)
const DATA = (col: string): Consulta => sqlBruto(`to_char(${col}, 'YYYY-MM-DD')`)

// --- Horarios de funcionamento ---
const SAIDA_HOR = sql`id, dia_semana, ${HM('abre')} as abre, ${HM('fecha')} as fecha, ativo,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

export function listarHorarios(exec: Executor, lojaId: string) {
  return consultar<HorarioSaida>(
    exec,
    sql`select ${SAIDA_HOR} from public.horarios_funcionamento
         where loja_id = ${lojaId} and ativo order by dia_semana, abre, id`,
  )
}

/** Faixas ATIVAS de um dia (para a checagem de sobreposicao no service); pode excluir um id. */
export function ativosDoDia(exec: Executor, lojaId: string, dia: number, exceto: string | null) {
  return consultar<FaixaHorario>(
    exec,
    sql`select dia_semana, ${HM('abre')} as abre, ${HM('fecha')} as fecha
          from public.horarios_funcionamento
         where loja_id = ${lojaId} and dia_semana = ${dia} and ativo
           and (${exceto}::uuid is null or id <> ${exceto}::uuid)`,
  )
}

export function inserirHorario(
  exec: Executor,
  lojaId: string,
  h: { dia_semana: number; abre: string; fecha: string; ativo: boolean },
) {
  return consultarUm<HorarioSaida>(
    exec,
    sql`insert into public.horarios_funcionamento (loja_id, dia_semana, abre, fecha, ativo)
        values (${lojaId}, ${h.dia_semana}, ${h.abre}::time, ${h.fecha}::time, ${h.ativo})
        returning ${SAIDA_HOR}`,
  )
}

export function obterHorario(exec: Executor, lojaId: string, id: string) {
  return consultarUm<HorarioSaida>(
    exec,
    sql`select ${SAIDA_HOR} from public.horarios_funcionamento
         where id = ${id} and loja_id = ${lojaId}`,
  )
}

export function atualizarHorario(
  exec: Executor,
  lojaId: string,
  id: string,
  p: { abre?: string; fecha?: string; ativo?: boolean },
) {
  const tem = (k: 'abre' | 'fecha' | 'ativo') => p[k] !== undefined
  return consultarUm<HorarioSaida>(
    exec,
    sql`update public.horarios_funcionamento set
          abre = case when ${tem('abre')}::boolean then ${p.abre ?? null}::time else abre end,
          fecha = case when ${tem('fecha')}::boolean then ${p.fecha ?? null}::time else fecha end,
          ativo = case when ${tem('ativo')}::boolean then ${p.ativo ?? null}::boolean else ativo end
        where id = ${id} and loja_id = ${lojaId}
        returning ${SAIDA_HOR}`,
  )
}

export function desativarHorario(exec: Executor, lojaId: string, id: string) {
  return consultarUm<HorarioSaida>(
    exec,
    sql`update public.horarios_funcionamento set ativo = false
         where id = ${id} and loja_id = ${lojaId} returning ${SAIDA_HOR}`,
  )
}

// --- Janela do atendente (uma linha por loja) ---
export async function obterJanela(
  exec: Executor,
  lojaId: string,
): Promise<JanelaAtendenteSaida | null> {
  const r = await consultarUm<Record<string, unknown>>(
    exec,
    sql`select ${HM('inicio')} as inicio, ${HM('fim')} as fim, dias, ativo,
               ${TS('atualizado_em')} as atualizado_em
          from public.janela_atendente where loja_id = ${lojaId}`,
  )
  return r ? mapJanela(r) : null
}

function mapJanela(r: Record<string, unknown>): JanelaAtendenteSaida {
  return {
    inicio: r['inicio'] as string,
    fim: r['fim'] as string,
    dias: r['dias'] as number[],
    ativo: r['ativo'] as boolean,
    atualizado_em: r['atualizado_em'] as string,
  }
}

export async function upsertJanela(
  exec: Executor,
  lojaId: string,
  j: { inicio: string; fim: string; dias: number[]; ativo: boolean },
): Promise<JanelaAtendenteSaida> {
  const r = await consultarUm<Record<string, unknown>>(
    exec,
    sql`insert into public.janela_atendente (loja_id, inicio, fim, dias, ativo)
        values (${lojaId}, ${j.inicio}::time, ${j.fim}::time, ${j.dias}::smallint[], ${j.ativo})
        on conflict (loja_id) do update
          set inicio = excluded.inicio, fim = excluded.fim, dias = excluded.dias, ativo = excluded.ativo
        returning ${HM('inicio')} as inicio, ${HM('fim')} as fim, dias, ativo,
                  ${TS('atualizado_em')} as atualizado_em`,
  )
  return mapJanela(r!)
}

// --- Excecoes / feriados ---
const SAIDA_EXC = sql`id, ${DATA('data')} as data, fechado, ${HM('abre')} as abre, ${HM('fecha')} as fecha,
  motivo, ativo, ${TS('criado_em')} as criado_em`

export function listarExcecoes(exec: Executor, lojaId: string) {
  return consultar<ExcecaoSaida>(
    exec,
    sql`select ${SAIDA_EXC} from public.excecoes_disponibilidade
         where loja_id = ${lojaId} and ativo order by data, id`,
  )
}

export function obterExcecao(exec: Executor, lojaId: string, id: string) {
  return consultarUm<ExcecaoSaida>(
    exec,
    sql`select ${SAIDA_EXC} from public.excecoes_disponibilidade
         where id = ${id} and loja_id = ${lojaId}`,
  )
}

export function inserirExcecao(
  exec: Executor,
  lojaId: string,
  e: { data: string; fechado: boolean; abre: string | null; fecha: string | null; motivo: string | null },
) {
  return consultarUm<ExcecaoSaida>(
    exec,
    sql`insert into public.excecoes_disponibilidade (loja_id, data, fechado, abre, fecha, motivo)
        values (${lojaId}, ${e.data}::date, ${e.fechado}, ${e.abre}::time, ${e.fecha}::time, ${e.motivo})
        returning ${SAIDA_EXC}`,
  )
}

export function desativarExcecao(exec: Executor, lojaId: string, id: string) {
  return consultarUm<ExcecaoSaida>(
    exec,
    sql`update public.excecoes_disponibilidade set ativo = false
         where id = ${id} and loja_id = ${lojaId} and ativo returning ${SAIDA_EXC}`,
  )
}

// --- Dados para o estado derivado (nunca persistido) ---
export function carregarHorariosAtivos(exec: Executor, lojaId: string) {
  return consultar<FaixaHorario>(
    exec,
    sql`select dia_semana, ${HM('abre')} as abre, ${HM('fecha')} as fecha
          from public.horarios_funcionamento where loja_id = ${lojaId} and ativo`,
  )
}

export function excecaoAtivaNaData(exec: Executor, lojaId: string, data: string) {
  return consultarUm<Excecao>(
    exec,
    sql`select ${DATA('data')} as data, fechado, ${HM('abre')} as abre, ${HM('fecha')} as fecha
          from public.excecoes_disponibilidade
         where loja_id = ${lojaId} and data = ${data}::date and ativo`,
  )
}

/** Auditoria sem PII (tabela eventos). `detalhes` nunca recebe dado sensivel. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidade: string; entidadeId: string; userId: string },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, 'loja',
                ${JSON.stringify({ user_id: e.userId })}::jsonb)`,
  )
}
