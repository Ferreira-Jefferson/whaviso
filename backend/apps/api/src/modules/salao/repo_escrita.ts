// Escrita do modulo (dono de mesas, comandas, comanda_itens), SQL parametrizado.
// Sem DELETE (nao ha grant): mesa some com ativo=false; comanda encerra com status='fechada'.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

/** Colunas editaveis de mesa num PATCH parcial (capacidade pode ir a null). */
const COLUNAS_MESA = ['nome', 'capacidade', 'ativo'] as const
export type CampoMesa = (typeof COLUNAS_MESA)[number]

export async function inserirMesa(
  exec: Executor,
  lojaId: string,
  d: { nome: string; capacidade: number | null },
): Promise<{ id: string }> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.mesas (loja_id, nome, capacidade)
        values (${lojaId}, ${d.nome}, ${d.capacidade})
        returning id`,
  )
  if (!r) throw new Error('insert de mesa sem retorno')
  return r
}

export async function atualizarMesa(
  exec: Executor,
  lojaId: string,
  id: string,
  patch: Partial<Record<CampoMesa, string | number | boolean | null>>,
): Promise<{ id: string } | null> {
  const partes: Consulta[] = COLUNAS_MESA.filter((c) => patch[c] !== undefined).map(
    (c) => sql`${sqlBruto(c)} = ${patch[c] ?? null}`,
  )
  if (partes.length === 0) return consultarUm<{ id: string }>(
    exec,
    sql`select id from public.mesas where id = ${id} and loja_id = ${lojaId}`,
  )
  const sets = partes.reduce((acc, parte, i) => (i === 0 ? parte : sql`${acc}, ${parte}`))
  return consultarUm<{ id: string }>(
    exec,
    sql`update public.mesas set ${sets} where id = ${id} and loja_id = ${lojaId} returning id`,
  )
}

export async function abrirComanda(
  exec: Executor,
  d: { lojaId: string; mesaId: string; userId: string; observacoes: string | null },
): Promise<{ id: string }> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.comandas (loja_id, mesa_id, status, aberta_por_user_id, observacoes)
        values (${d.lojaId}, ${d.mesaId}, 'aberta', ${d.userId}, ${d.observacoes})
        returning id`,
  )
  if (!r) throw new Error('insert de comanda sem retorno')
  return r
}

/** Trava a comanda na transacao (FOR UPDATE) e devolve o status atual. null = inexistente. */
export async function travarComanda(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ status: 'aberta' | 'fechada' }>(
    exec,
    sql`select status from public.comandas where id = ${id} and loja_id = ${lojaId} for update`,
  )
}

export async function inserirItem(
  exec: Executor,
  d: {
    lojaId: string
    comandaId: string
    itemId: string
    nomeItem: string
    quantidade: number
    precoUnitarioCentavos: number
  },
): Promise<{ id: string }> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.comanda_itens
          (loja_id, comanda_id, item_id, nome_item, quantidade, preco_unitario_centavos)
        values (${d.lojaId}, ${d.comandaId}, ${d.itemId}, ${d.nomeItem}, ${d.quantidade},
                ${d.precoUnitarioCentavos})
        returning id`,
  )
  if (!r) throw new Error('insert de comanda_item sem retorno')
  return r
}

/** Recalcula total_centavos da comanda a partir das linhas (quantidade * preco_unitario). */
export async function recalcularTotal(exec: Executor, lojaId: string, comandaId: string) {
  await consultar(
    exec,
    sql`update public.comandas c
           set total_centavos = s.soma
          from (select coalesce(sum(quantidade * preco_unitario_centavos), 0)::int as soma
                  from public.comanda_itens
                 where comanda_id = ${comandaId} and loja_id = ${lojaId}) s
         where c.id = ${comandaId} and c.loja_id = ${lojaId}`,
  )
}

/** Fecha a comanda se ainda aberta. null = ja fechada (corrida) ou inexistente. */
export async function fecharComanda(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ id: string }>(
    exec,
    sql`update public.comandas set status = 'fechada', fechada_em = now()
         where id = ${id} and loja_id = ${lojaId} and status = 'aberta'
        returning id`,
  )
}

/** Auditoria sem PII (tabela eventos). `detalhes` so com ids e user_id. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidade: string; entidadeId: string; detalhes: Record<string, unknown> },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, 'loja',
                ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
