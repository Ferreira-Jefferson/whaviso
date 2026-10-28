// Apresentacao da cozinha (KDS): acao principal por pedido e tom do tempo decorrido.
// A VALIDADE da transicao vem sempre do servidor (card.destinos); aqui so escolhemos o rotulo e o
// destaque. Modulo nao importa modulo: estas funcoes espelham a leitura de estado do painel, mas
// vivem no proprio modulo kds (coordenacao por contrato, nunca por import de @/modules/pedidos).
import type { PedidoCard } from '@/shared/contracts/_generated/pedidos'
import type { StatusPedido } from '@/shared/contracts/_generated/enums'

/** As duas colunas que a cozinha acompanha, na ordem do fluxo de producao. */
export const LANES: readonly { chave: 'novo' | 'em_preparo'; titulo: string }[] = [
  { chave: 'novo', titulo: 'Na fila' },
  { chave: 'em_preparo', titulo: 'Preparando' },
]

/** Ordem de preferencia do proximo passo "para frente" (igual a do painel). */
const PREFERENCIA: readonly StatusPedido[] = ['em_preparo', 'saiu_entrega', 'entregue']

export interface AcaoCozinha {
  status: StatusPedido
  rotulo: string
}

/**
 * Proxima acao da cozinha para o pedido, derivada de `card.destinos` (decisao do servidor):
 *  - `novo` -> iniciar o preparo (`em_preparo`);
 *  - `em_preparo` -> marcar pronto (`saiu_entrega` na entrega, `entregue` na retirada).
 * `null` quando nao ha avanco disponivel (ex.: pedido em problema, que tem fluxo proprio no painel).
 */
export function acaoPrincipal(card: PedidoCard): AcaoCozinha | null {
  const next = PREFERENCIA.find((s) => card.destinos.includes(s))
  if (!next) return null
  return { status: next, rotulo: next === 'em_preparo' ? 'Iniciar preparo' : 'Pronto' }
}

export type TomTempo = 'normal' | 'atencao' | 'urgente'

/** Limites (min) para destacar pedidos parados por etapa. So apresentacao, nao decide nada. */
const LIMITES: Partial<Record<StatusPedido, readonly [number, number]>> = {
  novo: [10, 20],
  em_preparo: [20, 40],
}

export function tomDoTempo(status: StatusPedido, minutos: number): TomTempo {
  const l = LIMITES[status]
  if (!l) return 'normal'
  if (minutos >= l[1]) return 'urgente'
  if (minutos >= l[0]) return 'atencao'
  return 'normal'
}

export function minutosDesde(iso: string, agora: number): number {
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000))
}

export function rotuloTempo(minutos: number): string {
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  return `${h} h ${minutos % 60} min`
}

export const ROTULO_ORIGEM = { whatsapp: 'WhatsApp', ifood: 'iFood', manual: 'Manual' } as const
