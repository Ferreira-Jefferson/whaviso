import type { ReactNode } from 'react'
import { cn } from './cn'

interface EmptyStateProps {
  titulo: string
  descricao?: string
  icone?: ReactNode
  acao?: ReactNode
  className?: string
}

export function EmptyState({ titulo, descricao, icone, acao, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-linha bg-cartao px-6 py-12 text-center',
        className,
      )}
    >
      {icone && <div className="mb-3 text-salvia">{icone}</div>}
      <h3 className="text-lg text-tinta">{titulo}</h3>
      {descricao && (
        <p className="mt-1 max-w-sm text-sm text-tinta-2">{descricao}</p>
      )}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}
