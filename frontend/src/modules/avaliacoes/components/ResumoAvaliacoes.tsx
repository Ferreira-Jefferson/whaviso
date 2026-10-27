// Resumo das avaliacoes: media, total e distribuicao por nota (5 para 1). Cada linha filtra a lista.
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
  if (!resumo) return null

  const media = resumo.media
  return (
    <Card className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="flex flex-col items-start gap-1">
        <p className="text-4xl font-semibold tabular-nums text-tinta">{media == null ? '-' : media.toFixed(2).replace('.', ',')}</p>
        {media != null && <Estrelas nota={media} />}
        <p className="text-xs text-tinta-2">
          {resumo.total} {resumo.total === 1 ? 'avaliação' : 'avaliações'}
        </p>
      </div>

      <ul className="flex flex-col gap-1.5" aria-label="Distribuição das notas">
        {NOTAS.map((n) => {
          const qtd = resumo.distribuicao[String(n) as '1' | '2' | '3' | '4' | '5']
          const pct = resumo.total > 0 ? Math.round((qtd / resumo.total) * 100) : 0
          const ativo = notaAtiva === n
          return (
            <li key={n}>
              <button
                type="button"
                aria-pressed={ativo}
                aria-label={`${n} estrelas: ${qtd} (${pct}%). Filtrar por esta nota`}
                onClick={() => aoEscolher(ativo ? null : n)}
                className={cn(
                  'flex min-h-8 w-full items-center gap-3 rounded-input px-2 text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
                  ativo ? 'bg-salvia-claro' : 'hover:bg-papel-2',
                )}
              >
                <span className="w-10 flex-none text-left tabular-nums text-tinta-2">{n} ★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-pill bg-papel-2" aria-hidden>
                  <span className="block h-full rounded-pill bg-ambar" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-16 flex-none text-right tabular-nums text-tinta-2">
                  {qtd} · {pct}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
