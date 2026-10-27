// Formas de pagamento: caixa (vendas por forma) + Pix online conciliado, sem dupla contagem.
import { CreditCard } from 'lucide-react'
import { Card, EmptyState, Skeleton } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import { useFormasPagamento } from '../api'
import type { Periodo } from '../periodo'
import { ErroRelatorio } from './ErroRelatorio'
import { Tile } from './Tile'

const ROTULO_FORMA = { dinheiro: 'Dinheiro', credito: 'Cartão de crédito', debito: 'Cartão de débito', pix: 'Pix', outro: 'Outras formas' } as const

export function SecaoPagamentos({ periodo }: { periodo: Periodo }) {
  const q = useFormasPagamento(periodo)
  const d = q.data

  if (q.isError) return <ErroRelatorio erro={q.error} aoTentarDeNovo={() => void q.refetch()} />

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile rotulo="Total recebido" carregando={q.isPending} valor={d ? formatarCentavos(d.total_centavos) : null} tom="folha" icone={<CreditCard className="size-4" aria-hidden />} detalhe="Caixa e Pix online" />
        <Tile rotulo="Transações" carregando={q.isPending} valor={d ? String(d.linhas.reduce((s, l) => s + l.transacoes, 0)) : null} />
      </div>
      <Card>
        {q.isPending ? (
          <div className="grid gap-3" aria-busy="true"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /></div>
        ) : d && d.linhas.length === 0 ? (
          <EmptyState icone={<CreditCard className="size-7" aria-hidden />} titulo="Nenhum pagamento no período" descricao="Vendas lançadas no caixa e Pix confirmados aparecem aqui." />
        ) : (
          <ul className="flex flex-col gap-4">
            {[...(d?.linhas ?? [])].sort((a, b) => b.valor_centavos - a.valor_centavos).map((l) => {
              const p = Math.round((l.participacao ?? 0) * 100)
              return (
                <li key={l.forma}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="text-tinta">{ROTULO_FORMA[l.forma]}</span>
                    <span className="tabular text-tinta-2">
                      {formatarCentavos(l.valor_centavos)} · {l.transacoes} {l.transacoes === 1 ? 'transação' : 'transações'} · {l.participacao === null ? '-' : `${p}%`}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-pill bg-papel-2" role="img" aria-label={`${ROTULO_FORMA[l.forma]}: ${formatarCentavos(l.valor_centavos)} (${p}%)`}>
                    <div className="h-full rounded-pill bg-salvia" style={{ width: `${p}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
