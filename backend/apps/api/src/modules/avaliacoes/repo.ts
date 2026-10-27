// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Toda consulta filtra por loja_id. Pedido e cliente sao lidos por SQL (sem importar modulos).
// Nenhum telefone e selecionado; o comentario (texto livre) nunca e logado.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { AvaliacaoDto } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface PedidoAvaliavel {
  id: string
  codigo: string
  status: string
  cliente_id: string | null
}

export async function obterPedido(exec: Executor, lojaId: string, pedidoId: string) {
  return consultarUm<PedidoAvaliavel>(
    exec,
    sql`select id, codigo, status::text as status, cliente_id
          from public.pedidos where id = ${pedidoId} and loja_id = ${lojaId}`,
  )
}

/** `null` quando o pedido ja tem avaliacao (unique por pedido; corrida resolvida no banco). */
export async function inserir(
  exec: Executor,
  d: { lojaId: string; pedidoId: string; clienteId: string; nota: number; comentario: string | null },
) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.avaliacoes (loja_id, pedido_id, cliente_id, nota, comentario)
        values (${d.lojaId}, ${d.pedidoId}, ${d.clienteId}, ${d.nota}, ${d.comentario})
        on conflict (pedido_id) do nothing
        returning id`,
  )
  return r?.id ?? null
}

const SAIDA = sql`a.id, a.pedido_id, p.codigo as pedido_codigo, a.cliente_id, c.nome as cliente_nome,
  a.nota, a.comentario, ${TS('a.criado_em')} as criado_em`
const DE = sqlBruto(`from public.avaliacoes a
  join public.pedidos p on p.id = a.pedido_id
  join public.clientes c on c.id = a.cliente_id`)

export async function obter(exec: Executor, lojaId: string, id: string) {
  return consultarUm<AvaliacaoDto>(
    exec,
    sql`select ${SAIDA} ${DE} where a.id = ${id} and a.loja_id = ${lojaId}`,
  )
}

export interface FiltroLista {
  nota?: number
  cursor?: { ts: string; id: string }
  limite: number
}

export async function listar(exec: Executor, lojaId: string, f: FiltroLista) {
  const porNota = f.nota ? sql` and a.nota = ${f.nota}` : sqlBruto('')
  const cursor = f.cursor
    ? sql` and (a.criado_em, a.id) < (${f.cursor.ts}::timestamptz, ${f.cursor.id}::uuid)`
    : sqlBruto('')
  return consultar<AvaliacaoDto>(
    exec,
    sql`select ${SAIDA} ${DE}
         where a.loja_id = ${lojaId}${porNota}${cursor}
         order by a.criado_em desc, a.id desc
         limit ${f.limite + 1}`,
  )
}

export async function resumo(exec: Executor, lojaId: string) {
  const r = await consultarUm<{
    total: number; media: string | null; n1: number; n2: number; n3: number; n4: number; n5: number
  }>(
    exec,
    sql`select count(*)::int as total, round(avg(nota), 2)::text as media,
               (count(*) filter (where nota = 1))::int as n1,
               (count(*) filter (where nota = 2))::int as n2,
               (count(*) filter (where nota = 3))::int as n3,
               (count(*) filter (where nota = 4))::int as n4,
               (count(*) filter (where nota = 5))::int as n5
          from public.avaliacoes where loja_id = ${lojaId}`,
  )
  return {
    total: r?.total ?? 0,
    media: r?.media != null ? Number(r.media) : null,
    distribuicao: { '1': r?.n1 ?? 0, '2': r?.n2 ?? 0, '3': r?.n3 ?? 0, '4': r?.n4 ?? 0, '5': r?.n5 ?? 0 },
  }
}

/** Auditoria sem PII (tabela eventos): so ids e nota, nunca o comentario. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; entidadeId: string; userId: string; nota: number },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, 'avaliacao.registrada', 'avaliacao', ${e.entidadeId}, 'loja',
                ${JSON.stringify({ user_id: e.userId, nota: e.nota })}::jsonb)`,
  )
}
