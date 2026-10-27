// Apresentacao do kanban: rotulos, acao primaria por card e tom do tempo decorrido.
// A transicao em si e decidida pelo servidor (card.destinos); aqui so escolhemos o que destacar.
import type { ColunaKanban, PedidoCard } from '@/shared/contracts/_generated/pedidos'
import type { StatusPedido } from '@/shared/contracts/_generated/enums'

export const COLUNAS: readonly { chave: ColunaKanban; titulo: string; tituloCurto: string }[] = [
  { chave: 'novo', titulo: 'Novo', tituloCurto: 'Novo' },
  { chave: 'em_preparo', titulo: 'Em preparo', tituloCurto: 'Em preparo' },
  { chave: 'saiu_entrega', titulo: 'Saiu para entrega', tituloCurto: 'Saiu' },
  { chave: 'entregue', titulo: 'Entregue', tituloCurto: 'Entregue' },
  { chave: 'problema', titulo: 'Problema', tituloCurto: 'Problema' },
]

export const ROTULO_ACAO: Partial<Record<StatusPedido, string>> = {
  em_preparo: 'Preparar',
  saiu_entrega: 'Saiu',
  entregue: 'Entregue',
}

/** Ordem de preferencia da acao principal: o proximo passo "para frente". */
const PREFERENCIA: readonly StatusPedido[] = ['em_preparo', 'saiu_entrega', 'entregue']

export interface AcoesCard {
  principal: StatusPedido | null
  /** Retomar (problema -> em preparo), quando o servidor permite. */
  retomar: boolean
  problema: boolean
}

export function acoesDoCard(card: PedidoCard): AcoesCard {
  const d = card.destinos
  const principal = PREFERENCIA.find((s) => d.includes(s) && !(card.status === 'problema' && s === 'em_preparo')) ?? null
  return {
    principal,
    retomar: card.status === 'problema' && d.includes('em_preparo'),
    problema: d.includes('problema'),
  }
}

/** Ordem fisica das etapas (inclui rascunho): base para dizer se um destino avanca ou volta. */
const ORDEM_STATUS: readonly StatusPedido[] = ['rascunho', 'novo', 'em_preparo', 'saiu_entrega', 'entregue', 'problema']

export interface DestinoMover {
  status: ColunaKanban
  titulo: string
  direcao: 'frente' | 'tras'
}

/**
 * Destinos de movimentacao do card, em ordem de coluna, com a direcao relativa ao status atual.
 * Exclui 'problema' (tem fluxo proprio, exige motivo). A validade vem do servidor (card.destinos),
 * entao pode incluir voltar uma etapa.
 */
export function destinosMover(card: PedidoCard): DestinoMover[] {
  const atual = ORDEM_STATUS.indexOf(card.status)
  return COLUNAS.filter((c) => c.chave !== 'problema' && card.destinos.includes(c.chave)).map((c) => ({
    status: c.chave,
    titulo: c.titulo,
    direcao: ORDEM_STATUS.indexOf(c.chave) < atual ? 'tras' : 'frente',
  }))
}

export type TomTempo = 'normal' | 'atencao' | 'urgente'

/** Limites (min) para destacar pedidos parados. So em novo/em_preparo; e apenas apresentacao. */
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

export function rotuloTempo(minutos: number, entregue: boolean): string {
  if (minutos < 1) return entregue ? 'agora' : 'agora'
  if (minutos < 60) return entregue ? `há ${minutos} min` : `${minutos} min`
  const h = Math.floor(minutos / 60)
  return entregue ? `há ${h} h` : `${h} h ${minutos % 60} min`
}

export const ROTULO_ORIGEM = { whatsapp: 'WhatsApp', ifood: 'iFood', manual: 'Manual' } as const
