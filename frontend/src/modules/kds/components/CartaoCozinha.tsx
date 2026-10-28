import { Bike, Check, ChefHat, Clock, ShoppingBag } from 'lucide-react'
import type { PedidoCard, PedidoDetalheSaida } from '@/shared/contracts/_generated/pedidos'
import { cn, Spinner } from '@/shared/ui'
import { acaoPrincipal, minutosDesde, rotuloTempo, tomDoTempo, type TomTempo } from '../estados'

interface Props {
  card: PedidoCard
  /** Detalhe com os itens (undefined enquanto carrega). */
  detalhe: PedidoDetalheSaida | undefined
  agora: number
  /** Mutacao de avanco em andamento para este pedido. */
  ocupado: boolean
  /** Pedido recem alterado ao vivo (realce breve). */
  destacado: boolean
  aoAvancar: (card: PedidoCard) => void
}

const BORDA_TOM: Record<TomTempo, string> = {
  normal: 'border-l-salvia',
  atencao: 'border-l-[#c7901f]',
  urgente: 'border-l-barro',
}
const TEXTO_TOM: Record<TomTempo, string> = {
  normal: 'text-tinta-2',
  atencao: 'text-[#8a5d14]',
  urgente: 'text-barro',
}

/** Um ticket da cozinha: codigo, tempo, modalidade, itens e a acao grande para avancar. */
export function CartaoCozinha({ card, detalhe, agora, ocupado, destacado, aoAvancar }: Props) {
  const minutos = minutosDesde(card.criado_em, agora)
  const tom = tomDoTempo(card.status, minutos)
  const acao = acaoPrincipal(card)
  const entrega = card.modalidade === 'entrega'
  const itens = (detalhe?.itens ?? []).filter((i) => !i.cancelado)

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-l-4 border-linha bg-cartao shadow-sm transition-shadow',
        BORDA_TOM[tom],
        destacado && 'ring-2 ring-folha ring-offset-2 ring-offset-papel',
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-linha px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl font-bold leading-none tabular-nums text-tinta">#{card.codigo}</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-bold',
                entrega ? 'bg-salvia/10 text-salvia' : 'bg-folha/10 text-folha',
              )}
            >
              {entrega ? <Bike className="size-3.5" aria-hidden /> : <ShoppingBag className="size-3.5" aria-hidden />}
              {entrega ? 'Entrega' : 'Retirada'}
            </span>
          </div>
          {card.cliente_nome && <p className="mt-1 truncate text-sm text-tinta-2">{card.cliente_nome}</p>}
        </div>
        <div className={cn('flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums', TEXTO_TOM[tom])}>
          <Clock className="size-4" aria-hidden />
          <span aria-label={`Há ${rotuloTempo(minutos)} na cozinha`}>{rotuloTempo(minutos)}</span>
        </div>
      </header>

      <div className="flex-1 px-4 py-3">
        {detalhe ? (
          <ul className="flex flex-col gap-2.5">
            {itens.map((i) => (
              <li key={i.id}>
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 font-display text-lg font-bold tabular-nums text-salvia">{i.quantidade}x</span>
                  <span className="text-lg font-semibold leading-tight text-tinta">{i.nome_snapshot}</span>
                </div>
                {i.opcoes.length > 0 && (
                  <ul className="mt-0.5 ml-8 list-disc text-[15px] text-tinta-2 marker:text-linha">
                    {i.opcoes.map((o) => (
                      <li key={o.id}>{o.nome_snapshot}</li>
                    ))}
                  </ul>
                )}
                {i.observacao && (
                  <p className="mt-1 ml-8 rounded-md bg-barro/8 px-2 py-1 text-[15px] font-medium text-barro">
                    Obs: {i.observacao}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-2 py-2 text-sm text-tinta-2" aria-busy="true">
            <Spinner className="size-4" /> Carregando itens...
          </div>
        )}

        {detalhe?.observacao && (
          <p className="mt-3 rounded-md border border-dashed border-linha bg-papel-2 px-2.5 py-1.5 text-sm text-tinta-2">
            <span className="font-bold text-tinta">Pedido:</span> {detalhe.observacao}
          </p>
        )}
      </div>

      {acao && (
        <div className="border-t border-linha p-3">
          <button
            type="button"
            onClick={() => aoAvancar(card)}
            disabled={ocupado}
            className={cn(
              'flex min-h-14 w-full items-center justify-center gap-2 rounded-card px-4 text-lg font-bold',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
              'disabled:cursor-not-allowed disabled:opacity-60',
              card.status === 'novo'
                ? 'bg-salvia text-sobre-marca hover:bg-salvia/90'
                : 'bg-folha text-sobre-marca hover:bg-folha/90',
            )}
          >
            {ocupado ? (
              <Spinner className="size-5" />
            ) : card.status === 'novo' ? (
              <ChefHat className="size-5" aria-hidden />
            ) : (
              <Check className="size-5" aria-hidden />
            )}
            {acao.rotulo}
          </button>
        </div>
      )}
    </article>
  )
}
