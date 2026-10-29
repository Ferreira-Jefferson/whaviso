// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado) e
// SEMPRE filtrando por loja_id do escopo (SEC-001/002).
//
// Dona (escrita): public.fichas_tecnicas. Le/escreve (baixa na venda) nas tabelas da 0026
// public.insumos e public.movimentos_insumo por SQL direto, porque modulo nunca importa modulo
// (nao importamos estoque_insumos). O contrato de colunas usadas esta no MODULE.md.
import { consultar, consultarUm, ErroBanco, sql, type Executor } from '@whaviso/shared/db'

export interface LinhaFicha {
  insumo_id: string
  quantidade: number
}

/** Existe o item nesta loja? (guarda de pertencimento, SEC-002). */
export async function itemDaLoja(exec: Executor, lojaId: string, itemId: string): Promise<boolean> {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n from public.itens where id = ${itemId} and loja_id = ${lojaId}`,
  )
  return (r?.n ?? 0) > 0
}

/** Quantos dos insumos informados pertencem a loja (guarda de pertencimento de cada insumo). */
export async function contarInsumosDaLoja(
  exec: Executor,
  lojaId: string,
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n from public.insumos
         where loja_id = ${lojaId} and id = any(${ids as string[]}::uuid[])`,
  )
  return r?.n ?? 0
}

/** Linhas ATIVAS da ficha do item (quantidade como numero; o banco guarda numeric). */
export async function linhasAtivas(
  exec: Executor,
  lojaId: string,
  itemId: string,
): Promise<LinhaFicha[]> {
  return consultar<LinhaFicha>(
    exec,
    sql`select insumo_id, quantidade::float8 as quantidade
          from public.fichas_tecnicas
         where loja_id = ${lojaId} and item_id = ${itemId} and ativo
         order by insumo_id`,
  )
}

/** Upsert de uma linha: reativa e reajusta a quantidade quando o par (item, insumo) ja existe. */
export async function salvarLinha(
  exec: Executor,
  lojaId: string,
  itemId: string,
  insumoId: string,
  quantidade: number,
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.fichas_tecnicas (loja_id, item_id, insumo_id, quantidade, ativo)
        values (${lojaId}, ${itemId}, ${insumoId}, ${quantidade}, true)
        on conflict (item_id, insumo_id)
        do update set quantidade = excluded.quantidade, ativo = true
        where public.fichas_tecnicas.loja_id = ${lojaId}`,
  )
}

/** Desativa (remocao logica) as linhas do item cujo insumo nao esta na lista mantida. */
export async function desativarForaDe(
  exec: Executor,
  lojaId: string,
  itemId: string,
  manter: readonly string[],
): Promise<void> {
  await consultar(
    exec,
    sql`update public.fichas_tecnicas set ativo = false
         where loja_id = ${lojaId} and item_id = ${itemId} and ativo
           and insumo_id <> all(${manter as string[]}::uuid[])`,
  )
}

/**
 * Baixa de VARIOS insumos de um pedido num unico statement: decrementa public.insumos.quantidade_atual
 * sem deixar negativo e registra o movimento 'consumo' com a quantidade resultante. Atomico (CTE) e
 * idempotente por (pedido_id, insumo_id): insumo que ja tem consumo para o pedido nao muda.
 * `linhas` deve ter insumo_id distintos (somar antes se repetir). Retorna quantos movimentos registrou.
 */
export async function baixarConsumo(
  exec: Executor,
  p: { lojaId: string; pedidoId: string; linhas: readonly { insumoId: string; consumo: number }[] },
): Promise<number> {
  if (p.linhas.length === 0) return 0
  const ids = p.linhas.map((l) => l.insumoId)
  const consumos = p.linhas.map((l) => l.consumo)
  try {
    const r = await consultarUm<{ n: number }>(
      exec,
      sql`with entrada as (
          select t.insumo_id, t.consumo
            from unnest(${ids as string[]}::uuid[], ${consumos as number[]}::numeric[]) as t(insumo_id, consumo)
           where not exists (
             select 1 from public.movimentos_insumo m
              where m.loja_id = ${p.lojaId} and m.pedido_id = ${p.pedidoId}
                and m.insumo_id = t.insumo_id and m.tipo = 'consumo')
        ),
        atualizado as (
          update public.insumos i
             set quantidade_atual = greatest(i.quantidade_atual - e.consumo, 0)
            from entrada e
           where i.id = e.insumo_id and i.loja_id = ${p.lojaId}
           returning i.id as insumo_id, i.quantidade_atual, e.consumo
        ),
        inserido as (
          insert into public.movimentos_insumo
            (loja_id, insumo_id, tipo, quantidade, quantidade_resultante, pedido_id)
          select ${p.lojaId}, a.insumo_id, 'consumo', a.consumo, a.quantidade_atual, ${p.pedidoId}
            from atualizado a
          returning 1
        )
        select count(*)::int as n from inserido`,
    )
    return r?.n ?? 0
  } catch (e) {
    // Corrida: outro lancamento de 'consumo' deste (pedido, insumo) commitou entre o `not exists`
    // e o insert; o indice unico parcial (0063) barra a duplicata. Ja estava registrado.
    if (e instanceof ErroBanco && e.tipo === 'unique') return 0
    throw e
  }
}

/** Auditoria sem PII (tabela eventos). `detalhes` so carrega ids e contagem. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; itemId: string; userId: string; qtdLinhas: number },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, 'ficha_tecnica.definida', 'item', ${e.itemId}, 'loja',
                ${JSON.stringify({ user_id: e.userId, linhas: e.qtdLinhas })}::jsonb)`,
  )
}
