import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { ColunaKanban, PedidoCard } from '@/shared/contracts/_generated/pedidos'
import { cn, Dialog } from '@/shared/ui'
import { destinosMover } from '../estados'

interface Props {
  card: PedidoCard | null
  ocupado: boolean
  aoEscolher: (status: ColunaKanban) => void
  aoCancelar: () => void
}

/**
 * Seletor de destino do pedido: o jeito de mover no mobile (onde so uma coluna aparece) e a
 * alternativa ao arrastar no desktop. Lista as etapas validas (do servidor), para frente e para
 * tras. 'Problema' fica de fora: tem botao proprio porque exige motivo.
 */
export function MoverPedidoDialog({ card, ocupado, aoEscolher, aoCancelar }: Props) {
  const destinos = card ? destinosMover(card) : []
  return (
    <Dialog aberto={card !== null} onFechar={aoCancelar} titulo={card ? `Mover ${card.codigo}` : 'Mover'}>
      {card && (
        <div className="grid gap-2">
          <p>Para onde vai o pedido? Dá para voltar uma etapa também.</p>
          {destinos.map((d) => {
            const frente = d.direcao === 'frente'
            return (
              <button
                key={d.status}
                type="button"
                disabled={ocupado}
                onClick={() => aoEscolher(d.status)}
                className={cn(
                  'flex min-h-12 items-center gap-2.5 rounded-input border border-linha bg-papel px-3 py-2.5 text-left text-tinta',
                  'hover:border-salvia focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:opacity-60',
                )}
              >
                <span
                  className={cn(
                    'inline-flex size-7 flex-none items-center justify-center rounded-pill',
                    frente ? 'bg-salvia/12 text-salvia' : 'bg-papel-2 text-tinta-2',
                  )}
                >
                  {frente ? <ArrowRight className="size-4" aria-hidden /> : <ArrowLeft className="size-4" aria-hidden />}
                </span>
                <span className="font-bold text-tinta">{d.titulo}</span>
                <span className="ml-auto text-xs font-bold uppercase tracking-[0.04em] text-tinta-2">{frente ? 'Avançar' : 'Voltar'}</span>
              </button>
            )
          })}
        </div>
      )}
    </Dialog>
  )
}
