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
  /**
   * Classes para destacar esta opção na lista aberta (ex.: uma opção de AÇÃO como
   * "+ Nova categoria"). Navegadores aplicam `color`/`font-weight` em <option>, então
   * cor e peso funcionam; hover/fundo em <option> nativo não são confiáveis.
   */
  className?: string
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
          <option key={op.value} value={op.value} className={op.className}>
            {op.label}
          </option>
        ))}
      </select>
      {displayLabel !== undefined && (
        // Opaco (bg-cartao) cobrindo o texto nativo do estado fechado; some quando a
        // lista abre (o popup do SO fica por cima). pointer-events-none deixa o clique
        // passar para o <select>; right-9 preserva a área do chevron.
        //
        // Recuo (inset-y-1/left-1) bem dentro da borda DE PROPÓSITO: como o span tem a
        // mesma cor do <select> (bg-cartao), o recuo é invisível e a única coisa que
        // importa é cobrir o texto SEM encostar na borda. Com recuo de 1px, em telas
        // escaladas (125%/150% no Windows) ou com zoom o arredondamento sub-pixel fazia
        // o span pintar sobre parte da borda de baixo (só no trecho que ele cobre),
        // deixando a linha "quebrada". Com folga de 4px isso não acontece em escala
        // nenhuma. pl-2 mantém o rótulo alinhado onde o texto normalmente fica (~12px).
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-1 right-9 flex items-center truncate bg-cartao pl-2 text-sm text-tinta"
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
