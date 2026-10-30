// Barras verticais em CSS puro (sem lib de grafico, como o resto do app) para a progressao de uma
// metrica 0..1 ao longo das execucoes. Escala fixa em 0..100% (o score e uma razao, nao um total).
// Cada barra e um role="img" com o valor por extenso; a tabela ao lado repete os numeros.
import { cn } from '@/shared/ui'

export interface PontoSerie {
  chave: string
  rotulo: string
  /** Razao 0..1; `null` = sem dado (barra vazia). */
  valor: number | null
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
  if (pontos.length === 0) return <p className="text-sm text-tinta-2">Sem execuções concluídas.</p>
  const ultimo = pontos.length - 1
  return (
    <ul className={cn('flex h-44 items-end gap-1.5 border-b border-linha sm:gap-2', className)}>
      {pontos.map((p, i) => {
        const altura = p.valor == null ? 2 : Math.max(2, Math.round(Math.min(1, Math.max(0, p.valor)) * 100))
        const recente = i === ultimo
        return (
          <li key={p.chave} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div
              role="img"
              aria-label={p.descricao}
              title={p.descricao}
              className={cn('w-full rounded-t-[4px] transition-opacity group-hover:opacity-100', recente ? 'opacity-100' : 'opacity-55')}
              style={{ height: `${altura}%`, backgroundColor: cor }}
            />
            <span className={cn('w-full truncate text-center text-[10px] sm:text-xs', recente ? 'font-semibold text-tinta' : 'text-tinta-2')}>{p.rotulo}</span>
          </li>
        )
      })}
    </ul>
  )
}
