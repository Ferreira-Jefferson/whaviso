// Cartao de uma mesa na grade: nome, lugares, estado (livre/ocupada/inativa) e, quando
// ocupada, o total da comanda aberta. Acao primaria muda com o estado: livre -> abrir
// comanda; ocupada -> ver comanda. O lapis edita o cadastro. Alvos tateis de 44px.
import { Pencil } from 'lucide-react'
import { Badge } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import type { MesaSaida } from '@/shared/contracts/_generated/salao'
import { ROTULO_ESTADO, TOM_ESTADO, estadoDaMesa, rotuloCapacidade } from '../estados'

interface Props {
  mesa: MesaSaida
  /** Esta mesa esta com a comanda selecionada (painel aberto ao lado). */
  selecionada: boolean
  /** Abrindo comanda nesta mesa agora (mutation em voo). */
  abrindo: boolean
  aoAbrirComanda: (mesa: MesaSaida) => void
  aoVerComanda: (comandaId: string) => void
  aoEditar: (mesa: MesaSaida) => void
}

export function MesaCard({ mesa, selecionada, abrindo, aoAbrirComanda, aoVerComanda, aoEditar }: Props) {
  const estado = estadoDaMesa(mesa)
  const lugares = rotuloCapacidade(mesa.capacidade)
  const total = mesa.comanda_aberta_total_centavos

  return (
    <div
      className={
        'flex flex-col gap-3 rounded-card border bg-cartao p-4 transition-colors ' +
        (selecionada ? 'border-salvia ring-1 ring-salvia' : 'border-linha')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold text-tinta">{mesa.nome}</h3>
          {lugares && <p className="mt-0.5 text-xs text-tinta-2">{lugares}</p>}
        </div>
        <Badge tom={TOM_ESTADO[estado]}>{ROTULO_ESTADO[estado]}</Badge>
      </div>

      {estado === 'ocupada' && total != null && (
        <p className="text-sm text-tinta-2">
          Total da comanda{' '}
          <span className="font-semibold tabular-nums text-tinta">{formatarCentavos(total)}</span>
        </p>
      )}

      <div className="mt-auto flex items-center gap-2">
        {estado === 'ocupada' && mesa.comanda_aberta_id ? (
          <button
            type="button"
            onClick={() => aoVerComanda(mesa.comanda_aberta_id as string)}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-pill border border-linha bg-cartao px-4 text-sm font-medium text-tinta hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
          >
            {selecionada ? 'Comanda aberta' : 'Ver comanda'}
          </button>
        ) : estado === 'livre' ? (
          <button
            type="button"
            onClick={() => aoAbrirComanda(mesa)}
            disabled={abrindo}
            aria-busy={abrindo}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-pill bg-salvia px-4 text-sm font-medium text-papel hover:bg-tinta disabled:cursor-not-allowed disabled:bg-salvia/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
          >
            {abrindo ? 'Abrindo...' : 'Abrir comanda'}
          </button>
        ) : (
          <span className="flex-1 text-sm text-tinta-2">Mesa desativada</span>
        )}

        <button
          type="button"
          onClick={() => aoEditar(mesa)}
          aria-label={`Editar mesa ${mesa.nome}`}
          className="inline-flex size-11 flex-none items-center justify-center rounded-pill border border-linha bg-cartao text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
        >
          <Pencil strokeWidth={1.75} className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
