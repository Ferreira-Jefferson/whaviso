// Rotulos e tons dos pagamentos (status vem do servidor; o cliente nao decide expiracao).
import type { StatusPagamento } from '@/shared/contracts/_generated/enums'

export const ROTULO_STATUS: Record<StatusPagamento, string> = {
  pendente: 'Aguardando Pix',
  pago: 'Pago',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
}

export const TOM_STATUS: Record<StatusPagamento, 'atencao' | 'sucesso' | 'neutro' | 'erro'> = {
  pendente: 'atencao',
  pago: 'sucesso',
  expirado: 'neutro',
  cancelado: 'erro',
}

/** Pedido so tem id nesta API: mostra o fim do UUID como referencia curta. */
export function refPedido(pedidoId: string): string {
  return pedidoId.slice(-6).toUpperCase()
}
