// Grafico de colunas em CSS puro (sem lib). Cada coluna tem tooltip nativo (title) e o
// conjunto e um role="img" com resumo. Rotulos do eixo aparecem de `passo` em `passo`.
import { cn } from '@/shared/ui'

export interface Coluna {
  chave: string
  rotulo: string
  valor: number
  /** Texto do tooltip (ex.: "14h: 7 pedidos"). */
  dica: string
  destaque?: boolean
}

interface Props {
  dados: Coluna[]
  resumo: string
  /** Mostra o rotulo a cada N colunas (default 1). */
  passo?: number
  cor?: string
  className?: string
}

export function BarrasVerticais({ dados, resumo, passo = 1, cor = 'var(--color-salvia)', className }: Props) {
  const max = Math.max(1, ...dados.map((d) => d.valor))
  return (
    <div role="img" aria-label={resumo} className={cn('w-full', className)}>
      <div className="flex h-40 items-end gap-px sm:gap-0.5">
        {dados.map((d) => (
          <div key={d.chave} title={d.dica} className="flex h-full min-w-0 flex-1 items-end">
            <div
              className="w-full rounded-t-sm"
              style={{
                height: d.valor > 0 ? `${Math.max(2, (d.valor / max) * 100)}%` : '0',
                backgroundColor: cor,
                opacity: d.destaque === false ? 0.45 : 1,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-px sm:gap-0.5" aria-hidden>
        {dados.map((d, i) => (
          <span key={d.chave} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-tinta-2">
            {i % passo === 0 ? d.rotulo : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
