// MoneyInput: máscara BRL que emite CENTAVOS (int). Um dos dois únicos
// pontos de conversão de dinheiro (o outro é MoneyText). Proibido parseFloat
// de valor solto em qualquer outro lugar (plano risco nº 5).
//
// Estratégia "caixa eletrônico": o usuário digita dígitos da direita para a
// esquerda; cada dígito vira centavo. Backspace remove o último. O valor
// controlado é o número de centavos (ou null quando vazio).
import { forwardRef, useCallback, type InputHTMLAttributes } from 'react'
import { brl } from '../format'
import { cn } from './cn'

type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  /** Valor em centavos (int) ou null quando vazio. */
  value: number | null
  /** Emite o novo valor em centavos (int) ou null. */
  onChange: (centavos: number | null) => void
  invalido?: boolean
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, className, invalido, ...rest }, ref) => {
    const texto = value === null ? '' : brl(value)

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const digitos = e.target.value.replace(/\D/g, '')
        onChange(digitos ? Number(digitos) : null)
      },
      [onChange],
    )

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={texto}
        onChange={handleChange}
        aria-invalid={invalido || undefined}
        placeholder="R$ 0,00"
        className={cn(
          'w-full rounded-input border bg-cartao px-3 py-2.5 text-sm text-tinta tabular',
          'placeholder:font-normal placeholder:text-tinta-2/60',
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
MoneyInput.displayName = 'MoneyInput'
