// Cartao de indicador do painel da plataforma. O StatCard do design system so mostra dinheiro;
// aqui o valor ja chega formatado (contagem, percentual ou BRL). Segue o padrao dos tiles
// elevados do app: chip de icone no tom da metrica e `destaque` para a metrica principal da grade.
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

// Chip do icone: tom suave da propria metrica (nunca alarmista).
const CHIP: Record<Tom, string> = {
  salvia: 'bg-salvia/10 text-salvia',
  folha: 'bg-folha/10 text-folha',
  ambar: 'bg-ambar/10 text-ambar',
  barro: 'bg-barro/10 text-barro',
  neutro: 'bg-papel-2 text-tinta-2',
}

interface KpiProps {
  rotulo: string
  valor: ReactNode
  detalhe?: string
  icone?: ReactNode
  tom?: Tom
  carregando?: boolean
  /** Metrica principal da grade: numero maior e card levemente realcado. */
  destaque?: boolean
}

export function Kpi({ rotulo, valor, detalhe, icone, tom = 'neutro', carregando = false, destaque = false }: KpiProps) {
  return (
    <Card className={cn('flex flex-col gap-2', destaque && 'ring-1 ring-salvia/15')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-tinta-2">{rotulo}</span>
        {icone && (
          <span className={cn('inline-flex size-8 flex-none items-center justify-center rounded-full', CHIP[tom])}>
            {icone}
          </span>
        )}
      </div>
      {carregando ? (
        <Skeleton className={cn(destaque ? 'h-9 w-28' : 'h-8 w-24')} />
      ) : (
        <span className={cn('tabular font-semibold tracking-tight', destaque ? 'text-3xl' : 'text-2xl', COR[tom])}>
          {valor}
        </span>
      )}
      {detalhe && <span className="text-xs leading-snug text-tinta-2">{detalhe}</span>}
    </Card>
  )
}
