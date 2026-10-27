// Resumo PURO do carrinho (snapshot de nome e preco, total em centavos), para o node `confirmar`.
// Reusa `montarLinha` (mesma regra de preco da criacao do pedido): o resumo mostrado e o que sera
// cobrado. Linha cujo item sumiu do cardapio vivo e ignorada no texto (o motor revalida de novo
// na criacao). Dinheiro em centavos; America/Sao_Paulo nao se aplica aqui (so valores).
import { montarLinha } from './cardapio'
import { formatarPreco } from './comum'
import type { CardapioCtx, LinhaCarrinho } from './tipos'

export interface ResumoCarrinho {
  texto: string
  subtotal_centavos: number
}

export function resumoCarrinho(cardapio: CardapioCtx, carrinho: readonly LinhaCarrinho[]): ResumoCarrinho {
  const linhas: string[] = []
  let subtotal = 0
  for (const l of carrinho) {
    const item = cardapio.itensPorId.get(l.item_id)
    const grupos = cardapio.gruposPorItem.get(l.item_id)
    if (!item || !grupos) continue
    try {
      const montada = montarLinha(item, grupos, l)
      subtotal += montada.total_centavos
      const extras = montada.opcoes.map((o) => o.nome_snapshot).join(', ')
      const sufixo = extras ? ` (${extras})` : ''
      linhas.push(`${montada.quantidade}x ${montada.nome_snapshot}${sufixo} - ${formatarPreco(montada.total_centavos)}`)
    } catch {
      // Linha invalida sob o cardapio atual: fora do resumo (o motor tambem a rejeita na criacao).
    }
  }
  const corpo = linhas.length
    ? `Seu pedido:\n${linhas.join('\n')}\n\nSubtotal: ${formatarPreco(subtotal)}`
    : 'Seu carrinho esta vazio.'
  return { texto: corpo, subtotal_centavos: subtotal }
}
