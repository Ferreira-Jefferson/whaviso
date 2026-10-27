// Decremento de estoque por VENDA: funcao pura e reutilizavel que o fluxo de pedido chama ao
// efetivar a venda de um item. Sem acesso HTTP; so toca estoque (contagem do item + diario).
//
// Invariantes:
//   - Idempotente por (pedido_id, item_id): rodar duas vezes nao decrementa duas vezes (ha
//     tambem um indice unico parcial no banco como rede de seguranca).
//   - Nunca deixa a contagem negativa: decrementa no maximo ate zero.
//   - Item sem controle ou com contagem ilimitada (NULL) e no-op (nada a decrementar).
//
// Rode SEMPRE dentro de uma transacao (passe o `client` do comTransacao): a trava FOR UPDATE da
// contagem so vale dentro dela, e o movimento + a contagem precisam cair juntos.
import type { Executor } from '@whaviso/shared/db'
import * as repo from './repo'

export interface ResultadoVenda {
  /** true quando a contagem mudou (movimento 'venda' gravado). */
  aplicado: boolean
  motivo?: 'sem_controle' | 'ilimitado' | 'ja_processado' | 'item_inexistente'
  quantidade_resultante?: number
}

export async function decrementarPorVenda(
  exec: Executor,
  entrada: { item_id: string; loja_id: string; quantidade: number; pedido_id: string },
): Promise<ResultadoVenda> {
  const { item_id, loja_id, quantidade, pedido_id } = entrada

  // Idempotencia: ja houve venda deste item neste pedido? Entao nada a fazer.
  if (await repo.vendaJaLancada(exec, loja_id, item_id, pedido_id)) {
    return { aplicado: false, motivo: 'ja_processado' }
  }

  const item = await repo.travarContagem(exec, loja_id, item_id)
  if (!item) return { aplicado: false, motivo: 'item_inexistente' }
  if (!item.controla_estoque) return { aplicado: false, motivo: 'sem_controle' }
  if (item.quantidade_disponivel === null) return { aplicado: false, motivo: 'ilimitado' }

  const resultante = Math.max(0, item.quantidade_disponivel - quantidade)
  await repo.atualizarQuantidade(exec, loja_id, item_id, resultante)
  await repo.registrarMovimento(exec, {
    lojaId: loja_id,
    itemId: item_id,
    tipo: 'venda',
    quantidade,
    quantidadeResultante: resultante,
    pedidoId: pedido_id,
  })
  return { aplicado: true, quantidade_resultante: resultante }
}
