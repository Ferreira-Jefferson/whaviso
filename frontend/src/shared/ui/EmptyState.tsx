import type { ReactNode } from 'react'

interface EmptyStateProps {
  titulo: string
  descricao?: string
  icone?: ReactNode
  acao?: ReactNode
}

export function EmptyState({ titulo, descricao, icone, acao }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-linha bg-cartao px-6 py-12 text-center">
      {icone && <div className="mb-3 text-salvia">{icone}</div>}
      <h3 className="text-lg text-tinta">{titulo}</h3>
      {descricao && (
        <p className="mt-1 max-w-sm text-sm text-tinta-2">{descricao}</p>
      )}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}
