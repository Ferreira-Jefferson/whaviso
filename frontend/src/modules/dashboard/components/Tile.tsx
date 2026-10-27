// Cartao de metrica (texto livre: contagem, percentual ou dinheiro ja formatado).
// `valor` null = metrica indisponivel para o papel atual (mostra traco e explica).
// `destaque` eleva a metrica principal (numero maior), para dar hierarquia a grade.
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

interface Props {
  rotulo: string
  valor: string | null
  detalhe?: string
  icone?: ReactNode
  tom?: Tom
  carregando?: boolean
  /** Metrica principal da grade: numero maior e card levemente realcado. */
  destaque?: boolean
}

export function Tile({ rotulo, valor, detalhe, icone, tom = 'neutro', carregando = false, destaque = false }: Props) {
  return (
    <Card className={cn('flex flex-col gap-2', destaque && 'ring-1 ring-salvia/15')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-tinta-2">{rotulo}</span>
        {icone && (
          <span className={cn('inline-flex size-8 flex-none items-center justify-center rounded-full', CHIP[valor === null ? 'neutro' : tom])}>
            {icone}
          </span>
        )}
      </div>
      {carregando ? (
        <Skeleton className={cn('w-28', destaque ? 'h-9' : 'h-8')} />
      ) : (
        <span
          className={cn(
            'tabular tracking-tight',
            destaque ? 'text-3xl' : 'text-2xl',
            valor === null ? 'text-tinta-2' : COR[tom],
          )}
        >
          {valor ?? '-'}
        </span>
      )}
      {valor === null && !carregando ? (
        <span className="text-xs text-tinta-2">Disponível para dono e gerente.</span>
      ) : (
        detalhe && <span className="text-xs text-tinta-2">{detalhe}</span>
      )}
    </Card>
  )
}
