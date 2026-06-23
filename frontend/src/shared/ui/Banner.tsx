import type { ReactNode } from 'react'
import { cn } from './cn'

type Tom = 'info' | 'sucesso' | 'erro'

interface BannerProps {
  tom?: Tom
  children: ReactNode
  className?: string
}

const TONS: Record<Tom, string> = {
  info: 'bg-salvia-claro text-salvia border-salvia/20',
  sucesso: 'bg-salvia-claro text-folha border-folha/20',
  erro: 'bg-ambar-claro text-barro border-barro/20',
}

// Aviso curto no topo de um formulário/página (sucesso, erro amigável, info).
export function Banner({ tom = 'info', children, className }: BannerProps) {
  return (
    <div
      role={tom === 'erro' ? 'alert' : 'status'}
      className={cn(
        'rounded-input border px-3 py-2.5 text-sm',
        TONS[tom],
        className,
      )}
    >
      {children}
    </div>
  )
}
