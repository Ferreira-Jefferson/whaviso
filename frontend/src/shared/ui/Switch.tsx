// Switch: interruptor acessivel (role="switch") para ligar/desligar. Consolida as copias
// locais `Alternador` (cardapio, fidelidade, promocoes) e o toggle do llm. Alvo de toque 44px.
import { cn } from './cn'

interface SwitchProps {
  ligado: boolean
  onMudar: (ligado: boolean) => void
  /** Rotulo acessivel; nao ha texto visivel ao lado. */
  rotulo: string
  carregando?: boolean
  disabled?: boolean
  /**
   * Sem o buffer de alvo de toque de 44px: so a pilula (24px). Use numa lista densa de
   * varios switches empilhados, onde o buffer cria um vacuo grande entre as linhas.
   */
  compacto?: boolean
}

export function Switch({ ligado, onMudar, rotulo, carregando, disabled, compacto = false }: SwitchProps) {
  const inativo = disabled || carregando
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      aria-busy={carregando || undefined}
      disabled={inativo}
      onClick={() => onMudar(!ligado)}
      className={cn(
        'relative inline-flex items-center px-1.5',
        !compacto && 'min-h-11',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
        inativo ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <span
        className={cn(
          'flex h-6 w-11 items-center rounded-pill p-0.5 transition-colors duration-150',
          ligado ? 'bg-salvia' : 'bg-linha',
        )}
      >
        <span
          className={cn(
            'size-5 rounded-full bg-cartao shadow-sm transition-transform duration-150',
            ligado ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  )
}
