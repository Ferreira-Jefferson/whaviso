import { MessageCircle, Search } from 'lucide-react'
import type { UseQueryResult } from '@tanstack/react-query'
import { cn, EmptyState, ErrorState, Input, SegmentedControl, Skeleton } from '@/shared/ui'
import type { ConversaLista } from '../api'
import { FILTROS_STATUS, type FiltroStatus } from '../estados'
import { ItemConversa } from './ItemConversa'

interface Props {
  status: FiltroStatus
  aoMudarStatus: (s: FiltroStatus) => void
  busca: string
  aoMudarBusca: (b: string) => void
  query: UseQueryResult<ConversaLista>
  selecionadaId: string | null
  aoSelecionar: (id: string) => void
  className?: string
}

/** Coluna da esquerda: filtro por estado, busca e a lista de conversas. */
export function ListaConversas({
  status,
  aoMudarStatus,
  busca,
  aoMudarBusca,
  query,
  selecionadaId,
  aoSelecionar,
  className,
}: Props) {
  const itens = query.data?.itens ?? []
  const filtrando = status !== 'todas' || busca.trim() !== ''

  return (
    <section aria-label="Conversas" className={cn('flex min-h-0 flex-col bg-cartao', className)}>
      <div className="flex-none border-b border-linha px-4 py-3">
        <label className="relative block">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => aoMudarBusca(e.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar conversas por nome"
            className="pl-9"
          />
        </label>
        <div className="-mx-4 mt-3 overflow-x-auto px-4">
          <SegmentedControl
            ariaLabel="Filtrar por estado"
            value={status}
            onChange={aoMudarStatus}
            options={FILTROS_STATUS}
            className="flex-nowrap"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending && <EsqueletoLista />}
        {query.isError && <ErrorState aoTentarDeNovo={() => void query.refetch()} className="m-4" />}

        {query.isSuccess && itens.length === 0 && (
          <EmptyState
            className="m-4"
            icone={<MessageCircle className="size-7" aria-hidden />}
            titulo={filtrando ? 'Nenhuma conversa com esse filtro' : 'Nenhuma conversa ainda'}
            descricao={
              filtrando
                ? 'Ajuste a busca ou o estado para ver outras conversas.'
                : 'Quando um cliente escrever no WhatsApp, a conversa aparece aqui sozinha.'
            }
          />
        )}

        {query.isSuccess &&
          itens.map((item) => (
            <ItemConversa key={item.id} item={item} selecionada={item.id === selecionadaId} aoSelecionar={aoSelecionar} />
          ))}

        {query.data?.proximo_cursor != null && (
          <p className="px-4 py-3 text-center text-xs text-tinta-2">Mostrando as conversas mais recentes.</p>
        )}
      </div>
    </section>
  )
}

function EsqueletoLista() {
  return (
    <div aria-busy="true" aria-label="Carregando conversas">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3 border-b border-linha px-4 py-3">
          <Skeleton className="size-9 flex-none rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}
