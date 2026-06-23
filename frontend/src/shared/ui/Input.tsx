import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Marca o campo como inválido (borda barro + aria-invalid). */
  invalido?: boolean
}

// Input base do design system: raio 8px, hairline, foco sálvia.
// Encaminha ref para integrar com o register() do react-hook-form.
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalido, ...rest }, ref) => {
    return (
      <input
        ref={ref}
        aria-invalid={invalido || undefined}
        className={cn(
          'w-full rounded-input border bg-cartao px-3 py-2.5 text-sm text-tinta',
          'placeholder:text-tinta-2/60',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalido ? 'border-barro' : 'border-linha',
          className,
        )}
        {...rest}
      />
    )
  },
)
Input.displayName = 'Input'
