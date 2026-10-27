// Cartao de uma mesa na grade (mapa do salao): faixa lateral e badge dao o estado
// (livre/ocupada/inativa) num relance; ocupada ganha um leve tom ambar. Quando ocupada,
// mostra o total da comanda aberta. Acao primaria (largura total) muda com o estado:
// livre -> abrir comanda; ocupada -> ver comanda. O lapis (44px) edita o cadastro.
import { Pencil, Users } from 'lucide-react'
import { Badge, cn } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import type { MesaSaida } from '@/shared/contracts/_generated/salao'
import { ACENTO_ESTADO, ROTULO_ESTADO, TOM_ESTADO, estadoDaMesa, rotuloCapacidade } from '../estados'

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
  const ocupada = estado === 'ocupada'
  const inativa = estado === 'inativa'

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-card border-y border-r border-linha border-l-4 p-4 transition-colors',
        ACENTO_ESTADO[estado],
        ocupada ? 'bg-ambar-claro/30' : 'bg-cartao',
        inativa && 'opacity-70',
        selecionada && 'ring-2 ring-salvia',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold text-tinta">{mesa.nome}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tom={TOM_ESTADO[estado]}>{ROTULO_ESTADO[estado]}</Badge>
            {lugares && (
              <span className="inline-flex items-center gap-1 text-xs text-tinta-2" title={lugares}>
                <Users strokeWidth={1.75} className="size-3.5" aria-hidden />
                <span className="tabular-nums">{mesa.capacidade}</span>
                <span className="sr-only">{lugares}</span>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => aoEditar(mesa)}
          aria-label={`Editar mesa ${mesa.nome}`}
          className="inline-flex size-11 flex-none items-center justify-center rounded-pill text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
        >
          <Pencil strokeWidth={1.75} className="size-4" aria-hidden />
        </button>
      </div>

      {ocupada && total != null && (
        <p className="text-sm text-tinta-2">
          Total da comanda{' '}
          <span className="font-semibold tabular-nums text-tinta">{formatarCentavos(total)}</span>
        </p>
      )}

      <div className="mt-auto">
        {ocupada && mesa.comanda_aberta_id ? (
          <button
            type="button"
            onClick={() => aoVerComanda(mesa.comanda_aberta_id as string)}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-pill border border-linha bg-cartao px-4 text-sm font-medium text-tinta hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
          >
            {selecionada ? 'Comanda aberta' : 'Ver comanda'}
          </button>
        ) : estado === 'livre' ? (
          <button
            type="button"
            onClick={() => aoAbrirComanda(mesa)}
            disabled={abrindo}
            aria-busy={abrindo}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-pill bg-salvia px-4 text-sm font-medium text-papel hover:bg-tinta disabled:cursor-not-allowed disabled:bg-salvia/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
          >
            {abrindo ? 'Abrindo...' : 'Abrir comanda'}
          </button>
        ) : (
          <span className="block py-2.5 text-center text-sm text-tinta-2">Mesa desativada</span>
        )}
      </div>
    </div>
  )
}
