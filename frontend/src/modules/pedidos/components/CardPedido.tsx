import { AlertCircle, ArrowLeftRight, Bike, Check, Clock, GripVertical, ShoppingBag } from 'lucide-react'
import type { PedidoCard } from '@/shared/contracts/_generated/pedidos'
import { cn, Spinner } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import { acoesDoCard, destinosMover, minutosDesde, ROTULO_ORIGEM, rotuloTempo, tomDoTempo } from '../estados'

interface Props {
  card: PedidoCard
  agora: number
  /** Card recem chegado ou alterado ao vivo. */
  destacado: boolean
  ocupado: boolean
  aoMarcarProblema: (card: PedidoCard) => void
  /** Abre o seletor de destino (avancar ou voltar). Caminho do mobile e alternativa ao arrastar. */
  aoAbrirMover: (card: PedidoCard) => void
  aoArrastarInicio: (card: PedidoCard) => void
  aoArrastarFim: () => void
}

const TOM_TEMPO = { normal: 'text-tinta-2', atencao: 'text-[#8a5d14]', urgente: 'text-barro' } as const

const BTN =
  'inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-pill border border-linha bg-cartao px-3 text-sm font-bold ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:cursor-not-allowed disabled:opacity-60'

/** Comanda: codigo, cliente, modalidade, total e como mover (arrastar no desktop, botao Mover em qualquer lugar). */
export function CardPedido({ card, agora, destacado, ocupado, aoMarcarProblema, aoAbrirMover, aoArrastarInicio, aoArrastarFim }: Props) {
  const acoes = acoesDoCard(card)
  const minutos = minutosDesde(card.criado_em, agora)
  const entregue = card.status === 'entregue'
  const tom = tomDoTempo(card.status, minutos)
  const entrega = card.modalidade === 'entrega'
  const itens = `${card.qtd_itens} ${card.qtd_itens === 1 ? 'item' : 'itens'}`
  const podeMover = destinosMover(card).length > 0

  return (
    <article
      aria-label={`Pedido ${card.codigo}`}
      draggable={podeMover}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', card.id)
        aoArrastarInicio(card)
      }}
      onDragEnd={aoArrastarFim}
      className={cn(
        'group relative rounded-card border bg-cartao',
        podeMover && 'md:cursor-grab md:active:cursor-grabbing',
        destacado ? 'border-salvia shadow-[0_0_0_2px_var(--cor-primaria),0_6px_18px_rgba(30,77,59,0.14)]' : 'border-linha',
      )}
    >
      {podeMover && (
        <GripVertical
          aria-hidden
          className="pointer-events-none absolute right-1 top-3 hidden size-4 text-tinta-2 opacity-0 transition-opacity group-hover:opacity-70 md:block"
        />
      )}
      <div className="flex items-baseline gap-2 px-3.5 pt-3">
        <span className="font-display text-[19px] font-bold tabular-nums">{card.codigo}</span>
        <span className={cn('ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold tabular-nums', TOM_TEMPO[tom])}>
          {entregue ? <Check className="size-[15px]" aria-hidden /> : <Clock className="size-[15px]" aria-hidden />}
          {rotuloTempo(minutos, entregue)}
        </span>
      </div>
      <p className="truncate px-3.5 pt-0.5 text-[15px] font-bold">{card.cliente_nome ?? 'Cliente sem nome'}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3.5 pb-3 pt-1 text-[13px] text-tinta-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill py-0.5 pl-1.5 pr-2.5 text-xs font-bold',
            entrega ? 'bg-revisao-claro text-revisao' : 'bg-ambar-claro text-[#8a5d14]',
          )}
        >
          {entrega ? <Bike className="size-[15px]" aria-hidden /> : <ShoppingBag className="size-[15px]" aria-hidden />}
          {entrega ? (card.motoboy_nome ?? 'Entrega') : 'Retirada'}
        </span>
        <span>{itens}</span>
        <span>{ROTULO_ORIGEM[card.origem]}</span>
      </div>
      {card.status === 'problema' && card.problema_motivo && (
        <p className="mx-3.5 mb-3 flex gap-2 rounded-input bg-barro/10 px-2.5 py-2 text-[13px] text-[#7c3a29]">
          <AlertCircle className="mt-0.5 size-[15px] flex-none" aria-hidden />
          <span>
            <b>Motivo:</b> {card.problema_motivo}
          </span>
        </p>
      )}
      <div className="relative border-t-[1.5px] border-dashed border-linha">
        <span aria-hidden className="absolute -left-2 -top-2 size-3.5 rounded-full border border-linha bg-papel-2 [clip-path:inset(0_0_0_50%)]" />
        <span aria-hidden className="absolute -right-2 -top-2 size-3.5 rounded-full border border-linha bg-papel-2 [clip-path:inset(0_50%_0_0)]" />
      </div>
      <div className="flex items-center gap-2 py-2.5 pl-3.5 pr-2.5">
        <span className="whitespace-nowrap text-[17px] font-bold tabular-nums">{formatarCentavos(card.total_centavos)}</span>
        <div className="ml-auto flex flex-none gap-1.5">
          {acoes.problema && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => aoMarcarProblema(card)}
              aria-label={`Marcar ${card.codigo} como problema`}
              className={cn(BTN, 'w-11 border-barro/30 px-0 text-barro')}
            >
              <AlertCircle className="size-5" aria-hidden />
            </button>
          )}
          {podeMover && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => aoAbrirMover(card)}
              aria-label={`Mover pedido ${card.codigo}`}
              className={cn(BTN, 'gap-1.5 px-3')}
            >
              {ocupado ? <Spinner /> : <ArrowLeftRight className="size-[15px]" aria-hidden />}
              Mover
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
