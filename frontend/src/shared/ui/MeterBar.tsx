// MeterBar: barra fina de proporcao (trilho + preenchimento), tingida por tom. Consolida
// as barras inline de promocoes (uso do cupom), campanhas (progresso de entrega),
// dashboard e relatorios. Decorativa por padrao; passe `rotulo` para dar nome acessivel.
import { cn } from './cn'

type Tom = 'salvia' | 'folha' | 'ambar' | 'barro'

const COR: Record<Tom, string> = {
  salvia: 'bg-salvia',
  folha: 'bg-folha',
  ambar: 'bg-ambar',
  barro: 'bg-barro',
}

interface MeterBarProps {
  valor: number
  max?: number
  tom?: Tom
  /** Rotulo acessivel; sem ele a barra e decorativa (aria-hidden). */
  rotulo?: string
  className?: string
}

export function MeterBar({ valor, max = 100, tom = 'salvia', rotulo, className }: MeterBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((valor / max) * 100))) : 0
  const semantica = rotulo
    ? { role: 'progressbar' as const, 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': rotulo }
    : { 'aria-hidden': true }
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-pill bg-papel-2', className)} {...semantica}>
      <div className={cn('h-full rounded-pill transition-[width] duration-300', COR[tom])} style={{ width: `${pct}%` }} />
    </div>
  )
}
