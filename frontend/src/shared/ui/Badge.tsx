import type { ReactNode } from 'react'
import { cn } from './cn'

type Tom = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro'

const TONS: Record<Tom, string> = {
  neutro: 'bg-papel-2 text-tinta-2',
  marca: 'bg-salvia-claro text-salvia',
  sucesso: 'bg-salvia-claro text-folha',
  atencao: 'bg-ambar-claro text-ambar',
  erro: 'bg-barro/10 text-barro',
}

/** Selo curto de status/contagem. O significado nunca depende so da cor: sempre leva texto. */
export function Badge({ tom = 'neutro', children, className }: { tom?: Tom; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-bold leading-5',
        TONS[tom],
        className,
      )}
    >
      {children}
    </span>
  )
}
