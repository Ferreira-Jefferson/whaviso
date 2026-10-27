import type { TipoEvento } from '../contracts/_generated'

/** Prefixo (queryKey[0]) das queries invalidadas por tipo de evento. Cada FR-* usa essas chaves. */
export const MAPA_INVALIDACAO: Record<TipoEvento, readonly string[]> = {
  'pedido.atualizado': ['pedidos', 'despacho', 'dashboard'],
  'conversa.mensagem': ['conversas'],
  'conversa.handoff': ['conversas'],
}
