// StatCard: cartão de métrica do painel financeiro (plano seção 1).
// Valor monetário em tabular-nums; tom suave (nunca alarmista). Linguagem das
// Regras de Ouro vive em quem o usa (rótulos), não aqui.
import type { ReactNode } from 'react'
import { Card } from './Card'
import { MoneyText } from './MoneyText'
import { Skeleton } from './Skeleton'
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
  /** Valor monetario (centavos). Use quando a metrica e dinheiro. */
  centavos?: number
  /** Valor ja formatado (contagem, texto, percentual). Tem prioridade sobre `centavos`. */
  valor?: ReactNode
  /** Texto auxiliar (ex.: "3 pedidos"). */
  detalhe?: string
  icone?: ReactNode
  tom?: Tom
  /** Realca a metrica principal: numero maior + anel sutil. */
  destaque?: boolean
  className?: string
  /**
   * True só quando ainda não há dado em cache (equivalente a `isLoading`, nunca
   * `isFetching`): mostra um Skeleton na linha do valor sem desmontar o card inteiro. Um
   * refetch em segundo plano (troca de período com `placeholderData: keepPreviousData`,
   * poller de versão) mantém o valor anterior em tela, sem "piscar". Prop opcional e
   * aditiva; default false.
   */
  carregando?: boolean
}

export function StatCard({
  rotulo,
  centavos,
  valor,
  detalhe,
  icone,
  tom = 'neutro',
  destaque = false,
  className,
  carregando = false,
}: StatCardProps) {
  const tamanho = destaque ? 'text-3xl' : 'text-2xl'
  return (
    <Card className={cn('flex flex-col gap-2', destaque && 'ring-1 ring-salvia/15', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-tinta-2">{rotulo}</span>
        {icone && <span className="text-tinta-2">{icone}</span>}
      </div>
      {carregando ? (
        <Skeleton className="h-8 w-24" />
      ) : valor != null ? (
        <span className={cn('font-semibold tabular tracking-tight', tamanho, COR_VALOR[tom])}>{valor}</span>
      ) : (
        <MoneyText centavos={centavos ?? 0} className={cn(tamanho, COR_VALOR[tom])} />
      )}
      {detalhe && <span className="text-xs text-tinta-2">{detalhe}</span>}
    </Card>
  )
}
