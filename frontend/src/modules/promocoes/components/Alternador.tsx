// Alternador: interruptor acessivel (role="switch"). Copia local do padrao do modulo cardapio
// (modulos nao se importam; candidato a promover para @/shared/ui). Alvo de toque 44px.
import { cn } from '@/shared/ui'

interface AlternadorProps {
  ligado: boolean
  onMudar: (ligado: boolean) => void
  /** Rotulo acessivel; nao ha texto visivel ao lado. */
  rotulo: string
  carregando?: boolean
  disabled?: boolean
}

export function Alternador({ ligado, onMudar, rotulo, carregando, disabled }: AlternadorProps) {
  const inativo = disabled || carregando
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      aria-busy={carregando || undefined}
      disabled={inativo}
      onClick={(e) => {
        e.stopPropagation()
        onMudar(!ligado)
      }}
      className={cn(
        'relative inline-flex min-h-11 items-center px-1.5',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
        inativo ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <span className={cn('flex h-6 w-11 items-center rounded-pill p-0.5 transition-colors duration-150', ligado ? 'bg-salvia' : 'bg-linha')}>
        <span className={cn('size-5 rounded-full bg-cartao shadow-sm transition-transform duration-150', ligado ? 'translate-x-5' : 'translate-x-0')} />
      </span>
    </button>
  )
}
