// Resumo das avaliacoes: media, total e distribuicao por nota (5 para 1). Cada linha filtra a lista.
import { Star } from 'lucide-react'
import { Card, Skeleton, cn } from '@/shared/ui'
import type { ResumoAvaliacoes as Resumo } from '../api'
import { Estrelas } from './Estrelas'

interface Props {
  resumo: Resumo | undefined
  carregando: boolean
  notaAtiva: number | null
  aoEscolher: (nota: number | null) => void
}

const NOTAS = [5, 4, 3, 2, 1] as const

export function ResumoAvaliacoes({ resumo, carregando, notaAtiva, aoEscolher }: Props) {
  if (carregando) return <Skeleton className="h-44 w-full" />
  // Sem avaliacoes: o resumo nao tem o que mostrar; a lista abaixo exibe o estado vazio.
  if (!resumo || resumo.total === 0) return null

  const { media, total } = resumo

  return (
    <Card className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
      <div className="flex flex-col items-start gap-2 border-b border-linha pb-5 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-8">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-5xl font-semibold leading-none tabular-nums text-tinta">
            {media == null ? '-' : media.toFixed(2).replace('.', ',')}
          </span>
          {media != null && <span className="text-sm text-tinta-2">de 5</span>}
        </div>
        {media != null && <Estrelas nota={media} tamanho="lg" />}
        <p className="text-xs text-tinta-2">
          {total} {total === 1 ? 'avaliação' : 'avaliações'}
        </p>
      </div>

      <ul className="flex flex-col gap-1" aria-label="Distribuição das notas">
        {NOTAS.map((n) => {
          const qtd = resumo.distribuicao[String(n) as '1' | '2' | '3' | '4' | '5']
          const pct = total > 0 ? Math.round((qtd / total) * 100) : 0
          const ativo = notaAtiva === n
          return (
            <li key={n}>
              <button
                type="button"
                aria-pressed={ativo}
                aria-label={`${n} estrelas: ${qtd} ${qtd === 1 ? 'avaliação' : 'avaliações'} (${pct}%). Filtrar por esta nota`}
                onClick={() => aoEscolher(ativo ? null : n)}
                className={cn(
                  'flex min-h-9 w-full items-center gap-3 rounded-input px-2 text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
                  ativo ? 'bg-salvia-claro' : 'hover:bg-papel-2',
                )}
              >
                <span className="flex w-8 flex-none items-center justify-end gap-0.5 tabular-nums text-tinta-2">
                  {n}
                  <Star className="size-3 fill-ambar text-ambar" aria-hidden />
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-pill bg-papel-2" aria-hidden>
                  <span
                    className="block h-full rounded-pill bg-ambar transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-16 flex-none text-right tabular-nums">
                  <span className={cn(ativo ? 'font-semibold text-tinta' : 'font-medium text-tinta')}>{qtd}</span>
                  <span className="text-tinta-2"> · {pct}%</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
