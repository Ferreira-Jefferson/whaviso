// SegmentedControl: seletor de opção única em "pílulas" (segmentos).
// Reusado para a direção no formulário e para as abas de status na lista.
// Genérico no tipo do valor (string). Acessível via role=radiogroup.
import { cn } from './cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentOption<T>>
  /** Rótulo acessível do grupo. */
  ariaLabel: string
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        // w-fit: num container flex-col (align-items: stretch) o inline-flex
        // esticaria; fit-content trava na largura do conteúdo (e ainda quebra
        // linha quando não cabe).
        'inline-flex w-fit flex-wrap gap-1 rounded-pill border border-linha bg-papel-2 p-1',
        className,
      )}
    >
      {options.map((op) => {
        const ativo = op.value === value
        return (
          <button
            key={op.value}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(op.value)}
            className={cn(
              'rounded-pill px-4 py-1.5 text-sm transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
              ativo
                ? 'bg-salvia text-papel'
                : 'text-tinta-2 hover:text-tinta',
            )}
          >
            {op.label}
          </button>
        )
      })}
    </div>
  )
}
