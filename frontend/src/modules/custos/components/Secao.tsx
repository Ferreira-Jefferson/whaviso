// Bloco de secao com titulo, estados de erro e carregamento padronizados.
import type { ReactNode } from 'react'
import { Card, ErrorState, Skeleton } from '@/shared/ui'

interface Props {
  titulo: string
  descricao?: string
  carregando?: boolean
  erro?: boolean
  aoTentarDeNovo?: () => void
  children?: ReactNode
}

export function Secao({ titulo, descricao, carregando, erro, aoTentarDeNovo, children }: Props) {
  return (
    <Card>
      <h2 className="text-lg text-salvia">{titulo}</h2>
      {descricao && <p className="mt-0.5 text-xs text-tinta-2">{descricao}</p>}
      <div className="mt-4">
        {erro ? (
          <ErrorState aoTentarDeNovo={aoTentarDeNovo} />
        ) : carregando ? (
          <div aria-busy="true" className="grid gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  )
}
