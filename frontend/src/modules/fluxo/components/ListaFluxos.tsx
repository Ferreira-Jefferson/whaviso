// Lista de fluxos da loja: nome, estado (ativo, versao publicada, rascunho) e acoes.
import { ChevronRight, GitBranch, Plus } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorState, IconChip, Skeleton } from '@/shared/ui'
import { formatarData } from '@/shared/format'
import { useFluxos } from '../api'

interface Props {
  onAbrir: (id: string) => void
  onNovo: () => void
}

export function ListaFluxos({ onAbrir, onNovo }: Props) {
  const lista = useFluxos()

  if (lista.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }
  if (lista.isError) return <ErrorState aoTentarDeNovo={() => void lista.refetch()} />
  if (lista.data.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum fluxo ainda"
        descricao="O fluxo define as etapas da conversa do atendente. Crie um a partir do padrão e ajuste."
        icone={<GitBranch className="size-8" strokeWidth={1.5} aria-hidden />}
        acao={
          <Button onClick={onNovo}>
            <Plus className="size-4" aria-hidden /> Novo fluxo
          </Button>
        }
      />
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {lista.data.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => onAbrir(f.id)}
            className="group flex min-h-16 w-full flex-wrap items-center gap-3 rounded-card border border-linha bg-cartao p-4 text-left transition-colors hover:border-salvia/40 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
          >
            <IconChip tom={f.ativo ? 'salvia' : 'neutro'} tamanho="md">
              <GitBranch strokeWidth={1.75} className="size-5" aria-hidden />
            </IconChip>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base font-semibold text-tinta">{f.nome}</span>
              <span className="block text-xs text-tinta-2">criado em {formatarData(f.criado_em)}</span>
            </span>
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              {f.ativo && <Badge tom="sucesso">Ativo</Badge>}
              {f.versao_publicada !== null ? (
                <Badge tom="marca">Versão {f.versao_publicada}</Badge>
              ) : (
                <Badge>Não publicado</Badge>
              )}
              {f.tem_rascunho && <Badge tom="atencao">Rascunho</Badge>}
            </span>
            <ChevronRight
              className="size-5 flex-none text-tinta-2 transition-transform group-hover:translate-x-0.5 group-hover:text-salvia"
              aria-hidden
            />
          </button>
        </li>
      ))}
    </ul>
  )
}
