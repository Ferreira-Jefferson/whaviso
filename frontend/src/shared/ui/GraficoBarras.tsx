// GraficoBarras: gráfico de barras horizontais em CSS puro (sem lib de gráfico,
// decisão de arquitetura do plano). Template reusável para as métricas do owner:
// recebe pares rótulo/valor e desenha cada barra com a contagem e o percentual
// sobre o total, ordenadas do maior para o menor. Acessível: cada barra é um
// role="img" com aria-label que lê valor e percentual.
import { cn } from './cn'

export interface BarraGrafico {
  rotulo: string
  valor: number
}

interface GraficoBarrasProps {
  dados: BarraGrafico[]
  /** Cor da barra (CSS var ou hex). Default: salvia. */
  cor?: string
  /** Texto exibido quando não há dados (ou total zero). */
  vazio?: string
  className?: string
}

export function GraficoBarras({
  dados,
  cor = 'var(--color-salvia)',
  vazio = 'Nada registrado ainda.',
  className,
}: GraficoBarrasProps) {
  const entradas = [...dados].sort((a, b) => b.valor - a.valor)
  const total = entradas.reduce((s, d) => s + d.valor, 0)

  if (entradas.length === 0 || total === 0) {
    return <p className="text-sm text-tinta-2">{vazio}</p>
  }

  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {entradas.map((d) => {
        const pct = Math.round((d.valor / total) * 100)
        return (
          <li key={d.rotulo}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-tinta">{d.rotulo}</span>
              <span className="tabular text-tinta-2">
                {d.valor} · {pct}%
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-pill bg-papel-2"
              role="img"
              aria-label={`${d.rotulo}: ${d.valor} (${pct}%)`}
            >
              <div
                className="h-full rounded-pill"
                style={{ width: `${pct}%`, backgroundColor: cor }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
