// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado) e
// SEMPRE filtrando por loja_id do escopo (SEC-001/002). Estoque vive em colunas de `itens`
// (controla_estoque, quantidade_disponivel) e no diario append-only `movimentos_item_estoque`.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { EstoqueItemDto, EstoqueMovimentoDto, TipoMovimentoRegistrado } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

const COLS_ITEM = sql`id, nome, categoria_id, controla_estoque, quantidade_disponivel, ativo`
const SAIDA_ITEM = sql`${COLS_ITEM}, ${TS('atualizado_em')} as atualizado_em`

export type ItemEstoqueRow = EstoqueItemDto

/** Item para calculo da venda/lancamento: contagem crua e flag de controle. */
export interface ContagemItem {
  id: string
  controla_estoque: boolean
  quantidade_disponivel: number | null
}

/** Itens com controle de estoque ligado; opcionalmente so os de contagem <= limiar (baixos). */
export async function listarComControle(
  exec: Executor,
  lojaId: string,
  f: { somenteBaixos: boolean; limiar: number },
): Promise<ItemEstoqueRow[]> {
  const baixos = f.somenteBaixos
    ? sql` and quantidade_disponivel is not null and quantidade_disponivel <= ${f.limiar}`
    : sqlBruto('')
  return consultar<ItemEstoqueRow>(
    exec,
    sql`select ${SAIDA_ITEM} from public.itens
         where loja_id = ${lojaId} and controla_estoque${baixos}
         order by quantidade_disponivel asc nulls last, nome, id`,
  )
}

export async function obterItem(exec: Executor, lojaId: string, id: string): Promise<ItemEstoqueRow | null> {
  return consultarUm<ItemEstoqueRow>(
    exec,
    sql`select ${SAIDA_ITEM} from public.itens where id = ${id} and loja_id = ${lojaId}`,
  )
}

/** Trava a linha do item (FOR UPDATE) e devolve a contagem atual. Use dentro de transacao. */
export async function travarContagem(exec: Executor, lojaId: string, id: string): Promise<ContagemItem | null> {
  return consultarUm<ContagemItem>(
    exec,
    sql`select id, controla_estoque, quantidade_disponivel
          from public.itens where id = ${id} and loja_id = ${lojaId} for update`,
  )
}

export async function definirControle(
  exec: Executor,
  lojaId: string,
  id: string,
  d: { controla_estoque: boolean; quantidade_disponivel: number | null },
): Promise<ItemEstoqueRow | null> {
  return consultarUm<ItemEstoqueRow>(
    exec,
    sql`update public.itens
           set controla_estoque = ${d.controla_estoque}, quantidade_disponivel = ${d.quantidade_disponivel}
         where id = ${id} and loja_id = ${lojaId}
       returning ${SAIDA_ITEM}`,
  )
}

/** So a contagem (usada na venda e no lancamento manual; nunca liga/desliga o controle). */
export async function atualizarQuantidade(
  exec: Executor,
  lojaId: string,
  id: string,
  quantidade: number,
): Promise<void> {
  await consultar(
    exec,
    sql`update public.itens set quantidade_disponivel = ${quantidade}
         where id = ${id} and loja_id = ${lojaId}`,
  )
}

export async function registrarMovimento(
  exec: Executor,
  m: {
    lojaId: string
    itemId: string
    tipo: TipoMovimentoRegistrado
    quantidade: number
    quantidadeResultante: number
    motivo?: string | null
    pedidoId?: string | null
    userId?: string | null
  },
): Promise<EstoqueMovimentoDto> {
  const linha = await consultarUm<EstoqueMovimentoDto>(
    exec,
    sql`insert into public.movimentos_item_estoque
          (loja_id, item_id, tipo, quantidade, quantidade_resultante, motivo, pedido_id, criado_por_user_id)
        values (${m.lojaId}, ${m.itemId}, ${m.tipo}, ${m.quantidade}, ${m.quantidadeResultante},
                ${m.motivo ?? null}, ${m.pedidoId ?? null}, ${m.userId ?? null})
      returning id, item_id, tipo, quantidade, quantidade_resultante, motivo, pedido_id,
                ${TS('criado_em')} as criado_em`,
  )
  return linha!
}

export async function listarMovimentos(
  exec: Executor,
  lojaId: string,
  itemId: string,
  limite: number,
): Promise<EstoqueMovimentoDto[]> {
  return consultar<EstoqueMovimentoDto>(
    exec,
    sql`select id, item_id, tipo, quantidade, quantidade_resultante, motivo, pedido_id,
               ${TS('criado_em')} as criado_em
          from public.movimentos_item_estoque
         where loja_id = ${lojaId} and item_id = ${itemId}
         order by criado_em desc, id desc limit ${limite}`,
  )
}

/** true se ja existe um lancamento de venda para (pedido, item) (idempotencia da venda). */
export async function vendaJaLancada(
  exec: Executor,
  lojaId: string,
  itemId: string,
  pedidoId: string,
): Promise<boolean> {
  const r = await consultarUm<{ existe: boolean }>(
    exec,
    sql`select true as existe from public.movimentos_item_estoque
         where loja_id = ${lojaId} and item_id = ${itemId} and pedido_id = ${pedidoId} and tipo = 'venda'
         limit 1`,
  )
  return r?.existe ?? false
}
