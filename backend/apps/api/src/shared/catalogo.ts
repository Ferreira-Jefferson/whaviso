import type { PoolClient } from '@whaviso/shared/db'
import type { ItemPedido } from '@whaviso/shared/contracts'

/**
 * E17/E18: ao REGISTRAR um combinado, cada item vira (ou reusa) um PRODUTO do catálogo do
 * dono, para o catálogo (Gestão > Produtos) e os itens dos combinados ficarem sempre juntos.
 * Faz upsert por nome (case-insensitive, entre os ativos: mesmo índice único de `produtos`) e
 * devolve os itens com `produto_id` preenchido (vínculo interno; a descrição/preço do item
 * seguem SNAPSHOT congelado, H17.3/H17.5). Regras:
 *  - item que JÁ traz `produto_id` (escolhido do catálogo) é respeitado, sem novo upsert;
 *  - item sem descrição (só espaços) é ignorado (não gera produto);
 *  - produto NOVO nasce com o preço do item; produto EXISTENTE NÃO tem o preço sobrescrito
 *    (o catálogo é só sugestão de partida; o valor do combinado é o snapshot do item).
 * Escopado ao dono (`profile_id = uid`). Roda na MESMA transação da criação/edição do aviso.
 */
export async function garantirProdutosDosItens(
  cli: PoolClient,
  uid: string,
  itens: readonly ItemPedido[],
): Promise<ItemPedido[]> {
  const comProduto: ItemPedido[] = []
  for (const item of itens) {
    const nome = item.descricao.trim()
    if (item.produto_id || nome === '') {
      comProduto.push(item)
      continue
    }
    // Upsert no índice parcial (profile_id, lower(nome)) where not arquivado: cria se não
    // existe (com o preço do item), senão reusa o existente (mantendo nome e preço dele).
    const { rows } = await cli.query<{ id: string }>(
      `insert into public.produtos (profile_id, nome, preco_venda_centavos)
       values ($1, $2, $3)
       on conflict (profile_id, lower(nome)) where not arquivado
         do update set nome = public.produtos.nome
       returning id`,
      [uid, nome, item.valor_unit_centavos],
    )
    comProduto.push({ ...item, produto_id: rows[0]?.id ?? null })
  }
  return comProduto
}
