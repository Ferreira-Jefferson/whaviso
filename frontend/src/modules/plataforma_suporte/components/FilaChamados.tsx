// Coluna da esquerda do console de suporte: filtro por status (segmentado), a fila de chamados de
// todas as lojas (paginacao por cursor) e "Carregar mais".
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query'
import { LifeBuoy } from 'lucide-react'
import { Badge, Button, cn, EmptyState, SegmentedControl, Skeleton, type SegmentOption } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { ChamadoPagina } from '@/shared/contracts/_generated/suporte'
import { AreaErro } from './AreaErro'
import { FILTROS_ORDEM, ROTULO_FILTRO, ROTULO_STATUS, TOM_STATUS, type FiltroStatus } from '../rotulos'

interface Props {
  filtro: FiltroStatus
  aoMudarFiltro: (f: FiltroStatus) => void
  query: UseInfiniteQueryResult<InfiniteData<ChamadoPagina>, Error>
  selecionadoId: string | null
  aoSelecionar: (id: string) => void
  className?: string
}

const OPCOES: ReadonlyArray<SegmentOption<FiltroStatus>> = FILTROS_ORDEM.map((f) => ({
  value: f,
  label: ROTULO_FILTRO[f],
}))

export function FilaChamados({ filtro, aoMudarFiltro, query, selecionadoId, aoSelecionar, className }: Props) {
  const itens = query.data?.pages.flatMap((p) => p.itens) ?? []

  return (
    <section aria-label="Fila de chamados" className={cn('flex min-h-0 flex-col bg-cartao', className)}>
      <div className="flex-none border-b border-linha px-3 py-3">
        <SegmentedControl value={filtro} onChange={aoMudarFiltro} options={OPCOES} ariaLabel="Filtrar chamados por status" preencher />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending && <EsqueletoLista />}
        {query.isError && <AreaErro erro={query.error} aoTentarDeNovo={() => void query.refetch()} />}

        {query.isSuccess && itens.length === 0 && (
          <EmptyState
            className="m-4"
            icone={<LifeBuoy className="size-7" aria-hidden />}
            titulo="Nenhum chamado"
            descricao="Não há chamados com esse filtro. Quando uma loja abrir um chamado, ele aparece aqui."
          />
        )}

        {query.isSuccess &&
          itens.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={c.id === selecionadoId ? 'true' : undefined}
              onClick={() => aoSelecionar(c.id)}
              className={cn(
                'flex w-full flex-col gap-1.5 border-b border-linha px-4 py-3 text-left transition-colors',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-salvia',
                c.id === selecionadoId ? 'bg-salvia-claro shadow-[inset_3px_0_0_0_var(--cor-primaria)]' : 'hover:bg-papel-2',
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-bold text-tinta">{c.assunto}</span>
                <Badge tom={TOM_STATUS[c.status]}>{ROTULO_STATUS[c.status]}</Badge>
              </span>
              <span className="text-xs text-tinta-2">Atualizado em {formatarDataHora(c.atualizado_em)}</span>
            </button>
          ))}

        {query.hasNextPage && (
          <div className="flex justify-center p-3">
            <Button variante="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              Carregar mais
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function EsqueletoLista() {
  return (
    <div aria-busy="true" aria-label="Carregando chamados">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-linha px-4 py-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}
