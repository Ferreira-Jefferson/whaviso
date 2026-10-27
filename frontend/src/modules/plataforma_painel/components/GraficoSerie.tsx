// Barras verticais em CSS puro (sem lib de grafico, como o resto do app). Acessivel: cada barra
// e um role="img" com o valor lido por extenso; a tabela abaixo na pagina repete os numeros.
// O ultimo mes (mais recente) fica em cor cheia; os anteriores, levemente suaves, para o olho
// pousar no agora sem esconder a tendencia.
import { cn } from '@/shared/ui'

export interface PontoSerie {
  rotulo: string
  valor: number
  /** Texto lido pelo leitor de tela e exibido no title. */
  descricao: string
}

export function GraficoSerie({
  pontos,
  cor = 'var(--color-salvia)',
  className,
}: {
  pontos: ReadonlyArray<PontoSerie>
  cor?: string
  className?: string
}) {
  const max = Math.max(...pontos.map((p) => p.valor), 0)
  if (pontos.length === 0 || max === 0) {
    return <p className="text-sm text-tinta-2">Sem valores no período.</p>
  }
  const ultimo = pontos.length - 1
  return (
    <ul className={cn('flex h-44 items-end gap-1.5 border-b border-linha sm:gap-2', className)}>
      {pontos.map((p, i) => {
        const altura = Math.max(2, Math.round((p.valor / max) * 100))
        const recente = i === ultimo
        return (
          <li key={p.rotulo} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div
              role="img"
              aria-label={p.descricao}
              title={p.descricao}
              className={cn(
                'w-full rounded-t-[4px] transition-opacity group-hover:opacity-100',
                recente ? 'opacity-100' : 'opacity-55',
              )}
              style={{ height: `${altura}%`, backgroundColor: cor }}
            />
            <span
              className={cn(
                'w-full truncate text-center text-[10px] sm:text-xs',
                recente ? 'font-semibold text-tinta' : 'text-tinta-2',
              )}
            >
              {p.rotulo}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
