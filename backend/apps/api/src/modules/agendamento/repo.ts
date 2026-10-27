// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Toda consulta filtra por loja_id. Pedidos sao lidos/atualizados por SQL (sem importar o modulo
// pedidos); so a coluna `agendado_para` e escrita aqui. Nenhum telefone e selecionado.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { AgendamentoDto } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface PedidoAgendavel {
  id: string
  status: string
  agendado_para: string | null
}

export async function obterPedido(exec: Executor, lojaId: string, pedidoId: string) {
  return consultarUm<PedidoAgendavel>(
    exec,
    sql`select id, status::text as status, ${TS('agendado_para')} as agendado_para
          from public.pedidos where id = ${pedidoId} and loja_id = ${lojaId}`,
  )
}

/** Define (instante) ou limpa (null) o agendamento. A guarda de status e reaplicada na query. */
export async function gravar(exec: Executor, lojaId: string, pedidoId: string, instante: string | null) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`update public.pedidos set agendado_para = ${instante}::timestamptz
         where id = ${pedidoId} and loja_id = ${lojaId} and status in ('rascunho', 'novo')
         returning id`,
  )
  return r !== null
}

/** Janela calculada no banco (relogio unico): atrasado < agora; liberar <= agora+antecedencia. */
const SAIDA = (antecedenciaMin: number) => sql`p.id as pedido_id, p.codigo, p.status::text as status,
  p.modalidade::text as modalidade, p.total_centavos, ${TS('p.agendado_para')} as agendado_para,
  case when p.agendado_para is null then null
       when p.agendado_para < now() then 'atrasado'
       when p.agendado_para <= now() + make_interval(mins => ${antecedenciaMin}::int) then 'liberar'
       else 'futuro' end as janela`

export async function obter(exec: Executor, lojaId: string, pedidoId: string, antecedenciaMin = 60) {
  return consultarUm<AgendamentoDto>(
    exec,
    sql`select ${SAIDA(antecedenciaMin)} from public.pedidos p
         where p.id = ${pedidoId} and p.loja_id = ${lojaId}`,
  )
}

export interface FiltroAgenda {
  antecedenciaMin: number
  de?: string
  ate?: string
  janela?: 'futuro' | 'liberar' | 'atrasado'
  cursor?: { ts: string; id: string }
  limite: number
}

/** Agenda: pedidos agendados ainda nao iniciados, do mais proximo ao mais distante. */
export async function listar(exec: Executor, lojaId: string, f: FiltroAgenda) {
  const de = f.de ? sql` and p.agendado_para >= ${f.de}::timestamptz` : sqlBruto('')
  const ate = f.ate ? sql` and p.agendado_para <= ${f.ate}::timestamptz` : sqlBruto('')
  const cursor = f.cursor
    ? sql` and (p.agendado_para, p.id) > (${f.cursor.ts}::timestamptz, ${f.cursor.id}::uuid)`
    : sqlBruto('')
  const janela = f.janela
    ? f.janela === 'atrasado'
      ? sql` and p.agendado_para < now()`
      : f.janela === 'liberar'
        ? sql` and p.agendado_para >= now()
               and p.agendado_para <= now() + make_interval(mins => ${f.antecedenciaMin}::int)`
        : sql` and p.agendado_para > now() + make_interval(mins => ${f.antecedenciaMin}::int)`
    : sqlBruto('')
  return consultar<AgendamentoDto>(
    exec,
    sql`select ${SAIDA(f.antecedenciaMin)} from public.pedidos p
         where p.loja_id = ${lojaId} and p.agendado_para is not null
           and p.status in ('rascunho', 'novo')${de}${ate}${janela}${cursor}
         order by p.agendado_para asc, p.id asc
         limit ${f.limite + 1}`,
  )
}

/** Auditoria sem PII (tabela eventos): so ids e instante. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; pedidoId: string; userId: string; tipo: string; agendadoPara: string | null },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'pedido', ${e.pedidoId}, 'loja',
                ${JSON.stringify({ user_id: e.userId, agendado_para: e.agendadoPara })}::jsonb)`,
  )
}
