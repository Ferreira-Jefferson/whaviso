// SQL parametrizado do modulo (SEC-080). Dono de escrita das tres tabelas de disponibilidade.
// Toda consulta filtra por loja_id (multi-tenant). time -> "HH:mm"; date -> "YYYY-MM-DD"; ts -> UTC ISO.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { FaixaHorario, Excecao } from '@whaviso/shared/disponibilidade'
import type { HorarioSaida, ExcecaoSaida, AgendamentoConfigSaida } from './schemas'

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
/** Serializa escritas de horario por loja (sobreposicao de faixas checada no service). */
export async function travarHorarios(exec: Executor, lojaId: string): Promise<void> {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtext(${'horario:' + lojaId}))`)
}

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

// --- Janela de agendamento da loja (uma linha por loja; modo desligado|faixa|24h) ---
const SAIDA_AG = sql`modo, ${HM('inicio')} as inicio, ${HM('fim')} as fim, dias,
  ${TS('atualizado_em')} as atualizado_em`

export async function obterAgendamento(
  exec: Executor,
  lojaId: string,
): Promise<AgendamentoConfigSaida | null> {
  const r = await consultarUm<Record<string, unknown>>(
    exec,
    sql`select ${SAIDA_AG} from public.agendamento_config where loja_id = ${lojaId}`,
  )
  return r ? mapAgendamento(r) : null
}

function mapAgendamento(r: Record<string, unknown>): AgendamentoConfigSaida {
  return {
    modo: r['modo'] as AgendamentoConfigSaida['modo'],
    inicio: (r['inicio'] as string | null) ?? null,
    fim: (r['fim'] as string | null) ?? null,
    dias: (r['dias'] as number[] | null) ?? [], // [] quando nao e faixa
    atualizado_em: r['atualizado_em'] as string,
  }
}

export async function upsertAgendamento(
  exec: Executor,
  lojaId: string,
  a: { modo: AgendamentoConfigSaida['modo']; inicio: string | null; fim: string | null; dias: number[] | null },
): Promise<AgendamentoConfigSaida> {
  const r = await consultarUm<Record<string, unknown>>(
    exec,
    sql`insert into public.agendamento_config (loja_id, modo, inicio, fim, dias)
        values (${lojaId}, ${a.modo}::modo_agendamento, ${a.inicio}::time, ${a.fim}::time, ${a.dias}::smallint[])
        on conflict (loja_id) do update
          set modo = excluded.modo, inicio = excluded.inicio, fim = excluded.fim, dias = excluded.dias
        returning ${SAIDA_AG}`,
  )
  return mapAgendamento(r!)
}

// --- Excecoes / feriados ---
const SAIDA_EXC = sql`id, ${DATA('data')} as data, fechado, ${HM('abre')} as abre, ${HM('fecha')} as fecha,
  motivo, ativo, ${TS('criado_em')} as criado_em`

export function listarExcecoes(exec: Executor, lojaId: string) {
  return consultar<ExcecaoSaida>(
    exec,
    sql`select ${SAIDA_EXC} from public.excecoes_disponibilidade
         where loja_id = ${lojaId} and ativo order by data, id limit 366`,
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
