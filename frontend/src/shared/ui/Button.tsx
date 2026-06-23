import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { Spinner } from './Spinner'

type Variante = 'primary' | 'secondary' | 'ghost' | 'destructive'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  loading?: boolean
  children: ReactNode
}

const VARIANTES: Record<Variante, string> = {
  primary:
    'bg-salvia text-papel hover:bg-tinta disabled:bg-salvia/60',
  secondary:
    'bg-cartao text-tinta border border-linha hover:bg-papel-2',
  ghost: 'bg-transparent text-salvia hover:bg-salvia-claro',
  destructive: 'bg-barro text-papel hover:opacity-90',
}

export function Button({
  variante = 'primary',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-pill px-5 py-2.5',
        'text-sm font-medium transition-[background-color,opacity] duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
        'disabled:cursor-not-allowed',
        VARIANTES[variante],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
