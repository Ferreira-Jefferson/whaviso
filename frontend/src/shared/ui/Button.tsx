import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { Spinner } from './Spinner'

type Variante = 'primary' | 'secondary' | 'ghost' | 'destructive'

type Tamanho = 'md' | 'icone'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  /** `icone` = botao quadrado so-icone (44px, sem padding horizontal). */
  tamanho?: Tamanho
  loading?: boolean
  children: ReactNode
}

const TAMANHOS: Record<Tamanho, string> = {
  md: 'px-5 py-2.5',
  icone: 'w-11 px-0',
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
  tamanho = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-pill',
        'text-sm font-medium transition-[background-color,opacity] duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
        'disabled:cursor-not-allowed',
        TAMANHOS[tamanho],
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
