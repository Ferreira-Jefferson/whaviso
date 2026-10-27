// Cartao de metrica (texto livre: contagem, percentual ou dinheiro ja formatado).
// `valor` null = metrica indisponivel para o papel atual (mostra traco e explica).
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

interface Props {
  rotulo: string
  valor: string | null
  detalhe?: string
  icone?: ReactNode
  tom?: Tom
  carregando?: boolean
}

export function Tile({ rotulo, valor, detalhe, icone, tom = 'neutro', carregando = false }: Props) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-tinta-2">{rotulo}</span>
        {icone && <span className="text-tinta-2">{icone}</span>}
      </div>
      {carregando ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span className={cn('tabular text-2xl', valor === null ? 'text-tinta-2' : COR[tom])}>
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
