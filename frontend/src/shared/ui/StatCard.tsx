// StatCard: cartão de métrica do painel financeiro (plano seção 1).
// Valor monetário em tabular-nums; tom suave (nunca alarmista). Linguagem das
// Regras de Ouro vive em quem o usa (rótulos), não aqui.
import type { ReactNode } from 'react'
import { Card } from './Card'
import { MoneyText } from './MoneyText'
import { cn } from './cn'

type Tom = 'salvia' | 'folha' | 'ambar' | 'neutro'

const COR_VALOR: Record<Tom, string> = {
  salvia: 'text-salvia',
  folha: 'text-folha',
  ambar: 'text-ambar',
  neutro: 'text-tinta',
}

interface StatCardProps {
  rotulo: string
  centavos: number
  /** Texto auxiliar (ex.: "3 combinados"). */
  detalhe?: string
  icone?: ReactNode
  tom?: Tom
  className?: string
}

export function StatCard({
  rotulo,
  centavos,
  detalhe,
  icone,
  tom = 'neutro',
  className,
}: StatCardProps) {
  return (
    <Card className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-tinta-2">{rotulo}</span>
        {icone && <span className="text-tinta-2">{icone}</span>}
      </div>
      <MoneyText centavos={centavos} className={cn('text-2xl', COR_VALOR[tom])} />
      {detalhe && <span className="text-xs text-tinta-2">{detalhe}</span>}
    </Card>
  )
}
