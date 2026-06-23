// Select: dropdown de opção única (native <select> estilizado como o Input).
// Use quando há MUITAS opções mutuamente exclusivas que não cabem em pílulas, ou
// quando o número de opções pode crescer e quebrar o layout em telas estreitas
// (ex.: o filtro de situação da lista de avisos). Para poucas opções táteis e
// sempre visíveis, prefira o SegmentedControl.
//
// Controlado e genérico no tipo do valor. Acessível de graça pelo <select>
// nativo (teclado + leitor de tela); como não há <label> visível, passe sempre
// `ariaLabel`. A mesma forma de opção do SegmentedControl ({ value, label }).
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

interface SelectProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SelectOption<T>>
  /** Rótulo acessível do controle (não há <label> visível). */
  ariaLabel: string
  /** Marca o campo como inválido (borda barro + aria-invalid). */
  invalido?: boolean
  disabled?: boolean
  /** Classes aplicadas ao wrapper (ex.: largura no desktop). */
  className?: string
  /**
   * Rótulo curto sobreposto SÓ no estado fechado (ex.: "🇨🇷 +506"). A lista aberta
   * continua mostrando o `label` completo de cada opção. Útil quando o nome todo
   * não cabe no controle fechado mas deve aparecer ao abrir.
   */
  displayLabel?: string
  /** Tooltip nativo ao passar o mouse (ex.: o nome completo do país). */
  title?: string
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  invalido,
  disabled,
  className,
  displayLabel,
  title,
}: SelectProps<T>) {
  return (
    <div className={cn('relative', className)}>
      <select
        aria-label={ariaLabel}
        aria-invalid={invalido || undefined}
        disabled={disabled}
        title={title}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(
          'w-full appearance-none rounded-input border bg-cartao py-2.5 pl-3 pr-9 text-sm text-tinta',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalido ? 'border-barro' : 'border-linha',
        )}
      >
        {options.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
      {displayLabel !== undefined && (
        // Opaco (bg-cartao) cobrindo o texto nativo do estado fechado; some quando a
        // lista abre (o popup do SO fica por cima). pointer-events-none deixa o clique
        // passar para o <select>; right-9 preserva a área do chevron.
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-px left-px right-9 flex items-center truncate rounded-l-input bg-cartao pl-3 text-sm text-tinta"
        >
          {displayLabel}
        </span>
      )}
      <ChevronDown
        strokeWidth={1.75}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2"
      />
    </div>
  )
}
