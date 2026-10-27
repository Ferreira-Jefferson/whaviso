// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Toda consulta filtra por loja_id. Pedido e cliente sao lidos por SQL (sem importar modulos).
// Nenhum telefone e selecionado.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { MovimentoDto, ProgramaNovo } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface ProgramaLinha extends ProgramaNovo {
  atualizado_em: string
}

export async function obterPrograma(exec: Executor, lojaId: string) {
  return consultarUm<ProgramaLinha>(
    exec,
    sql`select ativo, modo, cashback_bps, pontos_por_real, valor_ponto_centavos, minimo_resgate,
               max_resgate_bps, ${TS('atualizado_em')} as atualizado_em
          from public.fidelidade_programas where loja_id = ${lojaId}`,
  )
}

export async function salvarPrograma(exec: Executor, lojaId: string, p: ProgramaNovo) {
  await consultar(
    exec,
    sql`insert into public.fidelidade_programas
          (loja_id, ativo, modo, cashback_bps, pontos_por_real, valor_ponto_centavos, minimo_resgate, max_resgate_bps)
        values (${lojaId}, ${p.ativo}, ${p.modo}, ${p.cashback_bps}, ${p.pontos_por_real},
                ${p.valor_ponto_centavos}, ${p.minimo_resgate}, ${p.max_resgate_bps})
        on conflict (loja_id) do update set
          ativo = excluded.ativo, modo = excluded.modo, cashback_bps = excluded.cashback_bps,
          pontos_por_real = excluded.pontos_por_real, valor_ponto_centavos = excluded.valor_ponto_centavos,
          minimo_resgate = excluded.minimo_resgate, max_resgate_bps = excluded.max_resgate_bps`,
  )
}

export async function lojaTemMovimentos(exec: Executor, lojaId: string) {
  const r = await consultarUm<{ existe: boolean }>(
    exec,
    sql`select exists(select 1 from public.fidelidade_movimentos where loja_id = ${lojaId}) as existe`,
  )
  return r?.existe ?? false
}

export interface PedidoFidelidade {
  id: string
  codigo: string
  status: string
  cliente_id: string | null
  subtotal_centavos: number
}

export async function obterPedido(exec: Executor, lojaId: string, pedidoId: string) {
  return consultarUm<PedidoFidelidade>(
    exec,
    sql`select id, codigo, status::text as status, cliente_id, subtotal_centavos
          from public.pedidos where id = ${pedidoId} and loja_id = ${lojaId}`,
  )
}

export async function clienteExiste(exec: Executor, lojaId: string, clienteId: string) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.clientes where id = ${clienteId} and loja_id = ${lojaId}`,
  )
  return r !== null
}

/** Serializa os movimentos do mesmo cliente dentro da transacao (saldo_apos consistente). */
export async function travarCliente(exec: Executor, clienteId: string) {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtextextended(${'fidelidade:' + clienteId}, 0))`)
}

/** Saldo derivado do livro (acumulos menos resgates), na unidade do programa. */
export async function saldoDe(exec: Executor, lojaId: string, clienteId: string) {
  const r = await consultarUm<{ saldo: number }>(
    exec,
    sql`select coalesce(sum(case tipo when 'acumulo' then valor else -valor end), 0)::int as saldo
          from public.fidelidade_movimentos where loja_id = ${lojaId} and cliente_id = ${clienteId}`,
  )
  return r?.saldo ?? 0
}

export async function descontoDoResgate(exec: Executor, pedidoId: string) {
  const r = await consultarUm<{ desconto_centavos: number }>(
    exec,
    sql`select desconto_centavos from public.fidelidade_movimentos
         where pedido_id = ${pedidoId} and tipo = 'resgate'`,
  )
  return r?.desconto_centavos ?? 0
}

/** `null` quando ja existe movimento do mesmo tipo para o pedido (unique; corrida no banco). */
export async function inserirMovimento(
  exec: Executor,
  d: {
    lojaId: string; clienteId: string; pedidoId: string; tipo: 'acumulo' | 'resgate'
    valor: number; descontoCentavos: number | null; saldoApos: number; userId: string
  },
) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.fidelidade_movimentos
          (loja_id, cliente_id, pedido_id, tipo, valor, desconto_centavos, saldo_apos, criado_por_user_id)
        values (${d.lojaId}, ${d.clienteId}, ${d.pedidoId}, ${d.tipo}, ${d.valor}, ${d.descontoCentavos},
                ${d.saldoApos}, ${d.userId})
        on conflict (pedido_id, tipo) do nothing
        returning id`,
  )
  return r?.id ?? null
}

const SAIDA = sql`m.id, m.cliente_id, m.pedido_id, p.codigo as pedido_codigo, m.tipo, m.valor,
  m.desconto_centavos, m.saldo_apos, ${TS('m.criado_em')} as criado_em`
const DE = sqlBruto(`from public.fidelidade_movimentos m join public.pedidos p on p.id = m.pedido_id`)

export async function obterMovimento(exec: Executor, lojaId: string, id: string) {
  return consultarUm<MovimentoDto>(exec, sql`select ${SAIDA} ${DE} where m.id = ${id} and m.loja_id = ${lojaId}`)
}

export async function listarMovimentos(
  exec: Executor,
  lojaId: string,
  clienteId: string,
  f: { cursor?: number; limite: number },
) {
  const cursor = f.cursor !== undefined ? sql` and m.seq < ${f.cursor}` : sqlBruto('')
  return consultar<MovimentoDto & { seq: string }>(
    exec,
    sql`select ${SAIDA}, m.seq::text as seq ${DE}
         where m.loja_id = ${lojaId} and m.cliente_id = ${clienteId}${cursor}
         order by m.seq desc
         limit ${f.limite + 1}`,
  )
}

/** Auditoria sem PII (tabela eventos): so ids e valores. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidadeId: string; userId: string; detalhes: Record<string, unknown> },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'fidelidade', ${e.entidadeId}, 'loja',
                ${JSON.stringify({ user_id: e.userId, ...e.detalhes })}::jsonb)`,
  )
}
