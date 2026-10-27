// Acesso a dados do modulo crm: SO leitura sobre clientes_metricas/pedidos/itens_pedido (via SQL,
// sem importar outros modulos) e escrita em cliente_consentimento + eventos.
// Toda consulta filtra por loja_id. Nunca seleciona telefone (hash nem cifrado).
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface MetricasLinha {
  cliente_id: string
  nome: string | null
  pedidos_total: number
  gasto_total_centavos: number
  ticket_medio_centavos: number
  primeiro_pedido_em: string | null
  ultimo_pedido_em: string | null
  recencia_dias: number | null
  pedidos_180d: number
  gasto_180d_centavos: number
  nota_r: number | null
  nota_f: number | null
  nota_m: number | null
  segmento: string
  opt_out_marketing: boolean
}

const COLS_METRICAS = sql`m.cliente_id, m.nome, m.pedidos_total, m.gasto_total_centavos::int as gasto_total_centavos,
  m.ticket_medio_centavos, ${TS('m.primeiro_pedido_em')} as primeiro_pedido_em,
  ${TS('m.ultimo_pedido_em')} as ultimo_pedido_em, m.recencia_dias, m.pedidos_180d,
  m.gasto_180d_centavos::int as gasto_180d_centavos, m.nota_r, m.nota_f, m.nota_m, m.segmento,
  m.opt_out_marketing`

export interface FiltroLista {
  segmento?: string
  contactavel?: boolean
  cursor?: { gasto: number; id: string }
  limite: number
}

/** Ordena por gasto total desc (desempate id); cursor keyset (gasto, id). */
export async function listar(exec: Executor, lojaId: string, f: FiltroLista) {
  const porSeg = f.segmento ? sql` and m.segmento = ${f.segmento}` : sqlBruto('')
  const porContato =
    f.contactavel === undefined ? sqlBruto('') : sql` and m.opt_out_marketing = ${!f.contactavel}`
  const cursor = f.cursor
    ? sql` and (m.gasto_total_centavos, m.cliente_id) < (${f.cursor.gasto}::bigint, ${f.cursor.id}::uuid)`
    : sqlBruto('')
  return consultar<MetricasLinha>(
    exec,
    sql`select ${COLS_METRICAS}
          from public.clientes_metricas m
         where m.loja_id = ${lojaId}${porSeg}${porContato}${cursor}
         order by m.gasto_total_centavos desc, m.cliente_id desc
         limit ${f.limite + 1}`,
  )
}

export async function metricasDoCliente(exec: Executor, lojaId: string, id: string) {
  return consultarUm<MetricasLinha>(
    exec,
    sql`select ${COLS_METRICAS} from public.clientes_metricas m
         where m.loja_id = ${lojaId} and m.cliente_id = ${id}`,
  )
}

export async function resumo(exec: Executor, lojaId: string) {
  return consultar<{ segmento: string; clientes: number; gasto_180d: number; opt_outs: number }>(
    exec,
    sql`select m.segmento, count(*)::int as clientes,
               coalesce(sum(m.gasto_180d_centavos), 0)::int as gasto_180d,
               (count(*) filter (where m.opt_out_marketing))::int as opt_outs
          from public.clientes_metricas m
         where m.loja_id = ${lojaId}
         group by m.segmento`,
  )
}

/** Itens mais vendidos (pedidos entregues na janela; linhas canceladas fora). */
export async function itensMaisVendidos(exec: Executor, lojaId: string, dias: number, limite: number) {
  return consultar<{
    item_id: string | null
    nome: string
    quantidade: number
    clientes: number
    faturamento: number
  }>(
    exec,
    sql`select ip.item_id, ip.nome_snapshot as nome, sum(ip.quantidade)::int as quantidade,
               count(distinct p.cliente_id)::int as clientes,
               coalesce(sum(ip.total_centavos), 0)::int as faturamento
          from public.itens_pedido ip
          join public.pedidos p on p.id = ip.pedido_id and p.loja_id = ip.loja_id
         where p.loja_id = ${lojaId} and p.status = 'entregue' and not ip.cancelado
           and coalesce(p.entregue_em, p.criado_em) >= now() - make_interval(days => ${dias})
         group by ip.item_id, ip.nome_snapshot
         order by quantidade desc, faturamento desc, ip.nome_snapshot
         limit ${limite}`,
  )
}

/** Itens que um cliente mais comprou (pedidos entregues). */
export async function itensFavoritos(exec: Executor, lojaId: string, clienteId: string, limite: number) {
  return consultar<{ item_id: string | null; nome: string; quantidade: number }>(
    exec,
    sql`select ip.item_id, ip.nome_snapshot as nome, sum(ip.quantidade)::int as quantidade
          from public.itens_pedido ip
          join public.pedidos p on p.id = ip.pedido_id and p.loja_id = ip.loja_id
         where p.loja_id = ${lojaId} and p.cliente_id = ${clienteId} and p.status = 'entregue'
           and not ip.cancelado
         group by ip.item_id, ip.nome_snapshot
         order by quantidade desc, ip.nome_snapshot
         limit ${limite}`,
  )
}

/** Historico recente (sem rascunho). */
export async function ultimosPedidos(exec: Executor, lojaId: string, clienteId: string, limite: number) {
  return consultar<{
    id: string; codigo: string; status: string; modalidade: string; total_centavos: number; criado_em: string
  }>(
    exec,
    sql`select id, codigo, status::text as status, modalidade::text as modalidade, total_centavos,
               ${TS('criado_em')} as criado_em
          from public.pedidos
         where loja_id = ${lojaId} and cliente_id = ${clienteId} and status <> 'rascunho'
         order by criado_em desc, id desc
         limit ${limite}`,
  )
}

export interface ConsentimentoLinha {
  opt_out_marketing: boolean
  opt_out_em: string | null
  opt_in_em: string | null
  origem: string
  motivo: string | null
}
const COLS_CONSENT = sql`opt_out_marketing, ${TS('opt_out_em')} as opt_out_em, ${TS('opt_in_em')} as opt_in_em,
  origem, motivo`

export async function obterConsentimento(exec: Executor, lojaId: string, clienteId: string) {
  return consultarUm<ConsentimentoLinha>(
    exec,
    sql`select ${COLS_CONSENT} from public.cliente_consentimento
         where loja_id = ${lojaId} and cliente_id = ${clienteId}`,
  )
}

export async function clienteExiste(exec: Executor, lojaId: string, clienteId: string): Promise<boolean> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.clientes where id = ${clienteId} and loja_id = ${lojaId}`,
  )
  return r !== null && r !== undefined
}

/** Upsert do estado de consentimento. Opt-out grava opt_out_em; reversao grava opt_in_em. */
export async function definirConsentimento(
  exec: Executor,
  lojaId: string,
  clienteId: string,
  d: { optOut: boolean; origem: string; motivo: string | null; userId: string },
) {
  const r = await consultarUm<ConsentimentoLinha>(
    exec,
    sql`insert into public.cliente_consentimento
          (loja_id, cliente_id, opt_out_marketing, opt_out_em, opt_in_em, origem, motivo, atualizado_por_user_id)
        values (${lojaId}, ${clienteId}, ${d.optOut},
                ${d.optOut ? sql`now()` : sql`null`}, ${d.optOut ? sql`null` : sql`now()`},
                ${d.origem}, ${d.motivo}, ${d.userId})
        on conflict (cliente_id) do update set
          opt_out_marketing = excluded.opt_out_marketing,
          opt_out_em = case when excluded.opt_out_marketing
                            then now() else cliente_consentimento.opt_out_em end,
          opt_in_em = case when excluded.opt_out_marketing then cliente_consentimento.opt_in_em else now() end,
          origem = excluded.origem, motivo = excluded.motivo,
          atualizado_por_user_id = excluded.atualizado_por_user_id
        returning ${COLS_CONSENT}`,
  )
  return r!
}

/** Auditoria sem PII (tabela eventos). `detalhes` so recebe user_id e o estado do flag. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidadeId: string; userId: string; optOut: boolean },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'cliente', ${e.entidadeId}, 'loja',
                ${JSON.stringify({ user_id: e.userId, opt_out_marketing: e.optOut })}::jsonb)`,
  )
}
