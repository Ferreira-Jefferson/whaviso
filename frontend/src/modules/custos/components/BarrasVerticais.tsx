// Grafico de colunas em CSS puro (sem lib). Cada coluna tem tooltip nativo (title) e o
// conjunto e um role="img" com resumo. Rotulos do eixo aparecem de `passo` em `passo`.
// O dia em destaque (pico) ganha cor propria (corDestaque), nao dimerizacao do resto:
// assim a tendencia continua legivel e o pico sobressai pela cor + pela legenda do topo.
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
  /** Cor das colunas em destaque (default: a mesma de `cor`). */
  corDestaque?: string
  /** Valor ja formatado do topo da escala (hairline de referencia no topo). */
  rotuloMax?: string
  className?: string
}

export function BarrasVerticais({
  dados,
  resumo,
  passo = 1,
  cor = 'var(--color-salvia)',
  corDestaque,
  rotuloMax,
  className,
}: Props) {
  const max = Math.max(1, ...dados.map((d) => d.valor))
  const destaqueCor = corDestaque ?? cor
  return (
    <div role="img" aria-label={resumo} className={cn('w-full', className)}>
      {rotuloMax && (
        <div className="mb-2 flex items-center gap-2 text-[10px] text-tinta-2" aria-hidden>
          <span>Maior custo no dia</span>
          <span className="h-px flex-1 bg-linha" />
          <span className="tabular">{rotuloMax}</span>
        </div>
      )}
      <div className="flex h-40 items-end gap-px border-b border-linha sm:gap-0.5">
        {dados.map((d) => (
          <div key={d.chave} title={d.dica} className="flex h-full min-w-0 flex-1 items-end">
            <div
              className="w-full rounded-t-sm transition-[height] duration-300"
              style={{
                height: d.valor > 0 ? `${Math.max(2, (d.valor / max) * 100)}%` : '0',
                backgroundColor: d.destaque ? destaqueCor : cor,
              }}
            />
          </div>
        ))}
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
