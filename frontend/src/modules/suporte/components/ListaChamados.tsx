// Coluna da esquerda do suporte da loja: lista de chamados e o botao de abrir um novo.
import type { UseQueryResult } from '@tanstack/react-query'
import { LifeBuoy, Plus } from 'lucide-react'
import { Badge, Button, cn, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { ListaChamados as ListaChamadosDto } from '@/shared/contracts/_generated/suporte'
import { ROTULO_STATUS, TOM_STATUS } from '../rotulos'

interface Props {
  query: UseQueryResult<ListaChamadosDto>
  selecionadoId: string | null
  aoSelecionar: (id: string) => void
  aoAbrirNovo: () => void
  className?: string
}

export function ListaChamados({ query, selecionadoId, aoSelecionar, aoAbrirNovo, className }: Props) {
  const itens = query.data?.itens ?? []

  return (
    <section aria-label="Chamados" className={cn('flex min-h-0 flex-col bg-cartao', className)}>
      <div className="flex-none border-b border-linha px-4 py-3">
        <Button variante="primary" onClick={aoAbrirNovo} className="w-full">
          <Plus strokeWidth={1.75} className="size-4" aria-hidden />
          Abrir chamado
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending && <EsqueletoLista />}
        {query.isError && <ErrorState aoTentarDeNovo={() => void query.refetch()} className="m-4" />}

        {query.isSuccess && itens.length === 0 && (
          <EmptyState
            className="m-4"
            icone={<LifeBuoy className="size-7" aria-hidden />}
            titulo="Nenhum chamado ainda"
            descricao="Precisa de ajuda? Abra um chamado e a equipe Whaviso responde por aqui."
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
      </div>
    </section>
  )
}

function EsqueletoLista() {
  return (
    <div aria-busy="true" aria-label="Carregando chamados">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-linha px-4 py-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}
