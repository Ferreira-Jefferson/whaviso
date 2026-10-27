// Quadro (kanban) do funil: uma coluna por estagio com contagem total e os primeiros prospectos.
// Telefone nunca aparece aqui (so mascara na lista; claro so no detalhe). Mudar de estagio e no
// detalhe (a transicao e validada pelo servidor). Em telas estreitas as colunas rolam na horizontal.
import { Kanban, MapPin, UserRound } from 'lucide-react'
import { Badge, EmptyState, Skeleton, cn } from '@/shared/ui'
import type { EstagioProspecto } from '@/shared/contracts/_generated/enums'
import { useQuadro } from '../api'
import { ROTULO_ESTAGIO, TOM_ESTAGIO } from '../rotulos'
import { AreaErro } from './AreaErro'

/** Cor cheia do ponto do estagio (espelha a cor do selo TOM_ESTAGIO). */
const COR_ESTAGIO: Record<EstagioProspecto, string> = {
  novo: 'bg-cinza-expirado',
  contato: 'bg-salvia',
  proposta: 'bg-ambar',
  ativo: 'bg-folha',
  perdido: 'bg-barro',
}

export function QuadroFunil({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  const quadro = useQuadro(10)

  if (quadro.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <div aria-busy="true" aria-label="Carregando resumo" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] w-full" />
          ))}
        </div>
        <div aria-busy="true" aria-label="Carregando quadro" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    )
  }
  if (quadro.isError) return <AreaErro erro={quadro.error} aoTentarDeNovo={() => void quadro.refetch()} />

  const porEstagio = new Map(quadro.data.colunas.map((c) => [c.estagio, c.total]))
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

  const emAndamento = (porEstagio.get('novo') ?? 0) + (porEstagio.get('contato') ?? 0) + (porEstagio.get('proposta') ?? 0)
  const resumo = [
    { rotulo: 'No funil', valor: total, cor: 'bg-tinta', chip: 'bg-papel-2 text-tinta-2' },
    { rotulo: 'Em andamento', valor: emAndamento, cor: 'bg-salvia', chip: 'bg-salvia-claro text-salvia' },
    { rotulo: 'Viraram cliente', valor: porEstagio.get('ativo') ?? 0, cor: 'bg-folha', chip: 'bg-salvia-claro text-folha' },
    { rotulo: 'Perdidos', valor: porEstagio.get('perdido') ?? 0, cor: 'bg-barro', chip: 'bg-barro/10 text-barro' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {resumo.map((r) => (
          <div key={r.rotulo} className="flex items-center gap-3 rounded-card border border-linha bg-cartao p-3">
            <span className={cn('flex size-9 flex-none items-center justify-center rounded-pill', r.chip)} aria-hidden>
              <span className={cn('size-2.5 rounded-pill', r.cor)} />
            </span>
            <div className="min-w-0">
              <dd className="text-2xl font-semibold leading-none tabular-nums text-tinta">{r.valor}</dd>
              <dt className="mt-1 truncate text-xs text-tinta-2">{r.rotulo}</dt>
            </div>
          </div>
        ))}
      </dl>

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {quadro.data.colunas.map((col) => (
          <section
            key={col.estagio}
            aria-label={`${ROTULO_ESTAGIO[col.estagio]}, ${col.total} prospectos`}
            className="flex w-64 flex-none snap-start flex-col gap-2 overflow-hidden rounded-card border border-linha bg-papel-2 lg:min-w-0 lg:flex-1"
          >
            <header className="flex items-center justify-between gap-2 border-b border-linha px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn('size-2.5 flex-none rounded-pill', COR_ESTAGIO[col.estagio])} aria-hidden />
                <h3 className="truncate text-sm font-bold text-tinta">{ROTULO_ESTAGIO[col.estagio]}</h3>
              </span>
              <Badge tom={TOM_ESTAGIO[col.estagio]}>{col.total}</Badge>
            </header>
            <div className="flex flex-col gap-2 px-3 pb-3">
              {col.itens.length === 0 && (
                <p className="rounded-input border border-dashed border-linha py-5 text-center text-xs text-tinta-2">
                  Nenhum prospecto.
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {col.itens.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => aoAbrir(p.id)}
                      className="flex w-full flex-col gap-1.5 rounded-input border border-linha bg-cartao p-3 text-left text-sm transition-colors hover:border-salvia/40 hover:bg-papel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
                    >
                      <span className="font-medium text-tinta">{p.nome_restaurante}</span>
                      <span className="flex items-center gap-1.5 text-xs text-tinta-2">
                        <MapPin className="size-3.5 flex-none" aria-hidden />
                        <span className="truncate">{p.cidade ?? 'Cidade não informada'}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-tinta-2">
                        <UserRound className="size-3.5 flex-none" aria-hidden />
                        <span className="truncate">{p.responsavel_nome ?? 'Sem responsável'}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {col.total > col.itens.length && (
                <p className="pt-0.5 text-center text-xs text-tinta-2">
                  e mais {col.total - col.itens.length}. Veja todos na aba Lista.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
