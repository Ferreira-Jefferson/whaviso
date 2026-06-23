// MoneyText: exibe centavos (int) como BRL com numerais tabulares.
// Um dos dois únicos pontos de conversão de dinheiro (o outro é MoneyInput).
import { brl } from '../format'
import { cn } from './cn'

interface MoneyTextProps {
  /** Valor em centavos (int). */
  centavos: number
  className?: string
}

export function MoneyText({ centavos, className }: MoneyTextProps) {
  return <span className={cn('tabular', className)}>{brl(centavos)}</span>
}
