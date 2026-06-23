// DateInput: data de NEGÓCIO pura (YYYY-MM-DD), interpretada em
// America/Sao_Paulo pelo backend. Nunca calcula etapa/fuso no cliente
// (plano risco nº 4). Usa <input type="date">: o navegador entrega/recebe
// exatamente "YYYY-MM-DD", sem componente de hora nem fuso.
import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from './cn'

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  invalido?: boolean
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, invalido, ...rest }, ref) => {
    return (
      <input
        ref={ref}
        type="date"
        aria-invalid={invalido || undefined}
        className={cn(
          'w-full rounded-input border bg-cartao px-3 py-2.5 text-sm text-tinta',
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
DateInput.displayName = 'DateInput'
