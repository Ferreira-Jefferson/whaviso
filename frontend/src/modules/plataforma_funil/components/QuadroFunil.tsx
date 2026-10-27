// Quadro (kanban) do funil: uma coluna por estagio com contagem total e os primeiros prospectos.
// Telefone nunca aparece aqui (so mascara na lista; claro so no detalhe). Mudar de estagio e no
// detalhe (a transicao e validada pelo servidor). Em telas estreitas as colunas rolam na horizontal.
import { Kanban } from 'lucide-react'
import { Badge, EmptyState, Skeleton } from '@/shared/ui'
import { useQuadro } from '../api'
import { ROTULO_ESTAGIO, TOM_ESTAGIO } from '../rotulos'
import { AreaErro } from './AreaErro'

export function QuadroFunil({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  const quadro = useQuadro(10)

  if (quadro.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando quadro" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    )
  }
  if (quadro.isError) return <AreaErro erro={quadro.error} aoTentarDeNovo={() => void quadro.refetch()} />

  const total = quadro.data.colunas.reduce((s, c) => s + c.total, 0)
  if (total === 0) {
    return (
      <EmptyState
        icone={<Kanban className="size-7" aria-hidden />}
        titulo="O funil está vazio"
        descricao="Cadastre o primeiro prospecto para começar a acompanhar a aquisição."
      />
    )
  }

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {quadro.data.colunas.map((col) => (
        <section
          key={col.estagio}
          aria-label={`${ROTULO_ESTAGIO[col.estagio]}, ${col.total} prospectos`}
          className="flex w-64 flex-none flex-col gap-2 rounded-card border border-linha bg-papel-2 p-3 lg:min-w-0 lg:flex-1"
        >
          <header className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-tinta">{ROTULO_ESTAGIO[col.estagio]}</h3>
            <Badge tom={TOM_ESTAGIO[col.estagio]}>{col.total}</Badge>
          </header>
          {col.itens.length === 0 && <p className="py-4 text-center text-xs text-tinta-2">Nenhum prospecto.</p>}
          <ul className="flex flex-col gap-2">
            {col.itens.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => aoAbrir(p.id)}
                  className="flex w-full flex-col gap-1 rounded-input border border-linha bg-cartao p-3 text-left text-sm transition-colors hover:bg-papel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
                >
                  <span className="font-medium text-tinta">{p.nome_restaurante}</span>
                  <span className="text-xs text-tinta-2">{p.cidade ?? 'Cidade não informada'}</span>
                  <span className="text-xs text-tinta-2">{p.responsavel_nome ?? 'Sem responsável'}</span>
                </button>
              </li>
            ))}
          </ul>
          {col.total > col.itens.length && (
            <p className="text-center text-xs text-tinta-2">
              e mais {col.total - col.itens.length}. Veja todos na aba Lista.
            </p>
          )}
        </section>
      ))}
    </div>
  )
}
