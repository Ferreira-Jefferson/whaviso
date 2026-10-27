// Escrita do modulo (dono de pedidos, itens_pedido, itens_pedido_opcoes), SQL parametrizado.
// Sem DELETE (nao ha grant): linha removida = itens_pedido.cancelado = true.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { FormaPagamento, ModalidadePedido, StatusPedido } from '@whaviso/shared/contracts'
import type { LinhaMontada } from './montador'

/** Proximo codigo `AAMMDD-NNN` do dia (sequencia diaria por loja). Conflito = retry no chamador. */
export async function proximoCodigo(exec: Executor, lojaId: string, aammdd: string): Promise<string> {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select coalesce(max(substring(codigo from 8)::int), 0) + 1 as n
          from public.pedidos
         where loja_id = ${lojaId} and codigo ~ ${`^${aammdd}-[0-9]+$`}`,
  )
  return `${aammdd}-${String(r?.n ?? 1).padStart(3, '0')}`
}

export interface PedidoNovo {
  lojaId: string
  clienteId: string
  enderecoId: string | null
  modalidade: ModalidadePedido
  codigo: string
  subtotal: number
  taxa: number
  total: number
  formaPagamento: FormaPagamento | null
  trocoPara: number | null
  observacao: string | null
}

export async function inserirPedido(exec: Executor, p: PedidoNovo): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.pedidos
          (loja_id, cliente_id, endereco_id, codigo, status, origem, modalidade,
           subtotal_centavos, taxa_entrega_centavos, total_centavos,
           forma_pagamento, troco_para_centavos, observacao)
        values (${p.lojaId}, ${p.clienteId}, ${p.enderecoId}, ${p.codigo}, 'novo', 'manual',
                ${p.modalidade}::modalidade_pedido, ${p.subtotal}, ${p.taxa}, ${p.total},
                ${p.formaPagamento}, ${p.trocoPara}, ${p.observacao})
        returning id`,
  )
  if (!r) throw new Error('insert de pedido sem retorno')
  return r.id
}

export async function inserirLinha(exec: Executor, lojaId: string, pedidoId: string, l: LinhaMontada) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.itens_pedido
          (pedido_id, loja_id, item_id, nome_snapshot, preco_unitario_centavos, quantidade,
           total_centavos, observacao, criado_em)
        values (${pedidoId}, ${lojaId}, ${l.item_id}, ${l.nome_snapshot}, ${l.preco_unitario_centavos},
                ${l.quantidade}, ${l.total_centavos}, ${l.observacao}, clock_timestamp())
        returning id`,
  )
  if (!r) throw new Error('insert de item sem retorno')
  for (const o of l.opcoes) {
    await consultar(
      exec,
      sql`insert into public.itens_pedido_opcoes
            (item_pedido_id, loja_id, opcao_id, grupo_nome_snapshot, nome_snapshot, preco_centavos, criado_em)
          values (${r.id}, ${lojaId}, ${o.opcao_id}, ${o.grupo_nome_snapshot}, ${o.nome_snapshot},
                  ${o.preco_centavos}, clock_timestamp())`,
    )
  }
}

export async function marcarUsoEndereco(exec: Executor, lojaId: string, enderecoId: string) {
  await consultar(
    exec,
    sql`update public.enderecos set ultimo_uso_em = now() where id = ${enderecoId} and loja_id = ${lojaId}`,
  )
}

/** Troca de status com otimismo: so aplica se o status ainda e `de`. null = alguem mudou antes. */
export async function atualizarStatus(
  exec: Executor,
  lojaId: string,
  id: string,
  de: StatusPedido,
  para: StatusPedido,
  motivo: string | null,
) {
  return consultarUm<{ id: string }>(
    exec,
    sql`update public.pedidos
           set status = ${para}::status_pedido,
               problema_motivo = case when ${para}::status_pedido = 'problema' then ${motivo}
                                      else problema_motivo end,
               entregue_em = case when ${para}::status_pedido = 'entregue' then now() else entregue_em end
         where id = ${id} and loja_id = ${lojaId} and status = ${de}::status_pedido
        returning id`,
  )
}

/** Cancela a linha (so se ativa e do pedido/loja). null = nao existe ou ja cancelada. */
export async function cancelarLinha(exec: Executor, lojaId: string, pedidoId: string, itemId: string) {
  return consultarUm<{ id: string }>(
    exec,
    sql`update public.itens_pedido set cancelado = true
         where id = ${itemId} and pedido_id = ${pedidoId} and loja_id = ${lojaId} and not cancelado
        returning id`,
  )
}

export async function contarLinhasAtivas(exec: Executor, lojaId: string, pedidoId: string): Promise<number> {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n from public.itens_pedido
         where pedido_id = ${pedidoId} and loja_id = ${lojaId} and not cancelado`,
  )
  return r?.n ?? 0
}

/** Recalcula subtotal e total a partir das linhas ativas (total = subtotal + taxa). */
export async function recalcularTotais(exec: Executor, lojaId: string, pedidoId: string) {
  await consultar(
    exec,
    sql`update public.pedidos p
           set subtotal_centavos = s.soma,
               total_centavos = s.soma + p.taxa_entrega_centavos
          from (select coalesce(sum(total_centavos), 0)::int as soma from public.itens_pedido
                 where pedido_id = ${pedidoId} and loja_id = ${lojaId} and not cancelado) s
         where p.id = ${pedidoId} and p.loja_id = ${lojaId}`,
  )
}

export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; pedidoId: string; detalhes: Record<string, unknown> },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'pedido', ${e.pedidoId}, 'loja', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}

/** Trava a linha do pedido na transacao (FOR UPDATE) e devolve o status atual. */
export async function travarPedido(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ status: StatusPedido }>(
    exec,
    sql`select status from public.pedidos where id = ${id} and loja_id = ${lojaId} for update`,
  )
}
