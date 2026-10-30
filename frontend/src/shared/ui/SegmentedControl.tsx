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
  /**
   * Mantém os segmentos numa única linha (sem quebrar). Use dentro de um
   * container com `overflow-x-auto` em espaços estreitos: em vez de empilhar,
   * os segmentos rolam na horizontal.
   */
  semQuebra?: boolean
  /**
   * Ocupa a largura toda, dividindo os segmentos por igual (estilo iOS). Bom em
   * colunas estreitas: todos aparecem, sem quebra nem corte. Padding menor.
   */
  preencher?: boolean
  /**
   * Versão mais fina (menos padding), para ficar com a mesma altura de um campo
   * vizinho enxuto (ex.: um slider) num grupo de campos padronizados.
   */
  fino?: boolean
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  semQuebra = false,
  preencher = false,
  fino = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        // w-fit: num container flex-col (align-items: stretch) o inline-flex
        // esticaria; fit-content trava na largura do conteúdo. Por padrão quebra
        // linha quando não cabe; `semQuebra` fica numa linha só (o container de
        // fora rola na horizontal); `preencher` estica e divide por igual.
        'gap-1 rounded-pill border border-linha bg-papel-2',
        fino ? 'p-0.5' : 'p-1',
        preencher ? 'flex w-full' : 'inline-flex w-fit',
        preencher || semQuebra ? 'flex-nowrap' : 'flex-wrap',
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
              'whitespace-nowrap rounded-pill text-center transition-colors',
              fino ? 'py-1' : 'py-1.5',
              preencher ? 'min-w-0 flex-1 px-2 text-[13px]' : 'px-4 text-sm',
              !preencher && semQuebra && 'flex-none',
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
