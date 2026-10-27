import type { ConversaListaItem } from '@/shared/contracts/_generated/conversas'
import { cn } from '@/shared/ui'
import { formatarHora } from '@/shared/format'
import { previaLista, ROTULO_STATUS, TOM_STATUS } from '../estados'

const TOM_PONTO: Record<string, string> = {
  marca: 'bg-salvia',
  sucesso: 'bg-folha',
  neutro: 'bg-tinta-2',
}

interface Props {
  item: ConversaListaItem
  selecionada: boolean
  aoSelecionar: (id: string) => void
}

/** Linha da lista: cliente, previa da ultima mensagem, horario, estado e nao lidas. Sem telefone. */
export function ItemConversa({ item, selecionada, aoSelecionar }: Props) {
  const nome = item.cliente.nome ?? item.cliente.rotulo
  const ultima = item.ultima_mensagem
  const previa = ultima ? previaLista(ultima.previa, ultima.tipo) : 'Sem mensagens ainda'
  const saida = ultima?.direcao === 'saida'

  return (
    <button
      type="button"
      aria-current={selecionada ? 'true' : undefined}
      onClick={() => aoSelecionar(item.id)}
      className={cn(
        'flex w-full items-start gap-3 border-b border-linha px-4 py-3 text-left',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-salvia',
        selecionada ? 'bg-salvia-claro' : 'hover:bg-papel-2',
      )}
    >
      <span className="mt-1 flex size-9 flex-none items-center justify-center rounded-full bg-papel-2 text-sm font-bold text-tinta-2">
        {inicial(nome)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-bold text-tinta">{nome}</span>
          <span className="flex-none text-xs tabular-nums text-tinta-2">
            {ultima ? formatarHora(ultima.criado_em) : ''}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] text-tinta-2">
            {saida && <span className="text-tinta-2/70">Você: </span>}
            {previa}
          </span>
          {item.nao_lidas > 0 && (
            <span className="flex-none rounded-pill bg-salvia px-1.5 text-xs font-bold tabular-nums text-papel">
              {item.nao_lidas}
            </span>
          )}
        </span>
        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-pill bg-papel-2 py-0.5 pl-1.5 pr-2 text-[11px] font-bold text-tinta-2">
          <span aria-hidden className={cn('size-2 rounded-full', TOM_PONTO[TOM_STATUS[item.status]])} />
          {ROTULO_STATUS[item.status]}
        </span>
      </span>
    </button>
  )
}

function inicial(nome: string): string {
  const letra = nome.trim().charAt(0)
  return letra ? letra.toUpperCase() : '?'
}
