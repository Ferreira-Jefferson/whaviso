// Maquina de estados do pedido (funcoes PURAS, sem I/O). Hoje vive no modulo porque o kernel
// packages/shared esta fora do escopo desta entrega; a assinatura permite subir ao kernel
// (reuso pelo atendente) sem mudanca.
import type { ModalidadePedido, StatusPedido } from '@whaviso/shared/contracts'

const FLUXO: Record<StatusPedido, readonly StatusPedido[]> = {
  rascunho: ['novo'],
  novo: ['em_preparo', 'problema'],
  em_preparo: ['saiu_entrega', 'entregue', 'problema'],
  saiu_entrega: ['entregue', 'problema'],
  entregue: [],
  problema: ['em_preparo', 'saiu_entrega', 'entregue'],
}

/**
 * true se `de -> para` e permitida para a modalidade. Retirada pula `saiu_entrega` (em_preparo
 * vai direto a entregue); entrega nao pula (em_preparo -> entregue e negado). Sem retrocesso,
 * exceto via `problema` (retomada).
 */
export function podeTransicionar(
  de: StatusPedido,
  para: StatusPedido,
  modalidade: ModalidadePedido,
): boolean {
  if (!FLUXO[de].includes(para)) return false
  if (modalidade === 'retirada' && para === 'saiu_entrega') return false
  if (modalidade === 'entrega' && de === 'em_preparo' && para === 'entregue') return false
  return true
}

/** Destinos validos a partir de `de` (para o painel desenhar os botoes). */
export function destinosValidos(de: StatusPedido, modalidade: ModalidadePedido): StatusPedido[] {
  return FLUXO[de].filter((p) => podeTransicionar(de, p, modalidade))
}

/** `problema` exige motivo (o check do banco tambem obriga). */
export function motivoObrigatorio(para: StatusPedido): boolean {
  return para === 'problema'
}

/** Linha de itens so pode ser cancelada enquanto o pedido esta em novo/em_preparo. */
export function permiteCancelarLinha(status: StatusPedido): boolean {
  return status === 'novo' || status === 'em_preparo'
}
