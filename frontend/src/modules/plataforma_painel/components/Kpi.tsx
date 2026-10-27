// Cartao de indicador do painel da plataforma. O StatCard do design system so mostra dinheiro;
// aqui o valor ja chega formatado (contagem, percentual ou BRL).
import type { ReactNode } from 'react'
import { Card, Skeleton, cn } from '@/shared/ui'

type Tom = 'salvia' | 'folha' | 'ambar' | 'barro' | 'neutro'

const COR: Record<Tom, string> = {
  salvia: 'text-salvia',
  folha: 'text-folha',
  ambar: 'text-ambar',
  barro: 'text-barro',
  neutro: 'text-tinta',
}

interface KpiProps {
  rotulo: string
  valor: ReactNode
  detalhe?: string
  tom?: Tom
  carregando?: boolean
}

export function Kpi({ rotulo, valor, detalhe, tom = 'neutro', carregando = false }: KpiProps) {
  return (
    <Card className="flex flex-col gap-2">
      <span className="text-sm text-tinta-2">{rotulo}</span>
      {carregando ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span className={cn('tabular text-2xl font-semibold', COR[tom])}>{valor}</span>
      )}
      {detalhe && <span className="text-xs text-tinta-2">{detalhe}</span>}
    </Card>
  )
}
