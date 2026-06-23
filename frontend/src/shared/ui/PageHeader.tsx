import type { ReactNode } from 'react'

interface PageHeaderProps {
  titulo: string
  descricao?: string
  acoes?: ReactNode
}

export function PageHeader({ titulo, descricao, acoes }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-salvia sm:text-3xl">{titulo}</h1>
          {descricao && (
            <p className="mt-1 text-sm text-tinta-2">{descricao}</p>
          )}
        </div>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </div>
      {/* divisor decorativo fino estilo editorial */}
      <div className="mt-4 h-px w-full bg-linha" />
    </header>
  )
}
