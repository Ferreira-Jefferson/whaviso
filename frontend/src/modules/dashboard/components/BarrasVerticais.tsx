// Grafico de colunas em CSS puro (sem lib). Cada coluna tem tooltip nativo (title) e o
// conjunto e um role="img" com resumo. Rotulos do eixo aparecem de `passo` em `passo`.
// A coluna de maior valor ganha destaque; dias sem registro mantem a trilha visivel para
// o eixo nunca "sumir". Escala maxima anotada no topo para dar contexto de grandeza.
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
  const temDados = dados.some((d) => d.valor > 0)
  return (
    <div role="img" aria-label={resumo} className={cn('w-full', className)}>
      <div className="mb-1 flex h-4 items-end justify-end">
        {temDados && (
          <span className="tabular text-[10px] leading-none text-tinta-2">
            máx <span className="text-tinta">{max}</span>
          </span>
        )}
      </div>
      <div className="flex h-40 items-end gap-px border-b border-linha sm:gap-0.5">
        {dados.map((d) => {
          const altura = d.valor > 0 ? Math.max(4, (d.valor / max) * 100) : 0
          const pico = d.valor === max && d.valor > 0
          return (
            <div
              key={d.chave}
              title={d.dica}
              className="group flex h-full min-w-0 flex-1 items-end rounded-t-sm transition-colors hover:bg-papel-2/70"
            >
              <div
                className="w-full rounded-t-[3px] transition-[height] duration-300 ease-out group-hover:brightness-95"
                style={{
                  height: `${altura}%`,
                  backgroundColor: cor,
                  opacity: d.destaque === false ? 0.4 : pico ? 1 : 0.82,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-px sm:gap-0.5" aria-hidden>
        {dados.map((d, i) => (
          <span key={d.chave} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-tinta-2">
            {i % passo === 0 ? d.rotulo : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
