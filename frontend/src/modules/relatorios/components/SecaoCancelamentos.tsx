// Pedidos com problema (nao existe status "cancelado"), agrupados pelo motivo informado.
import { CircleAlert, Percent, Wallet } from 'lucide-react'
import { Card, EmptyState, Skeleton } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import { useCancelamentos } from '../api'
import type { Periodo } from '../periodo'
import { ErroRelatorio } from './ErroRelatorio'
import { Tile } from './Tile'

export function SecaoCancelamentos({ periodo }: { periodo: Periodo }) {
  const q = useCancelamentos(periodo)
  const d = q.data

  if (q.isError) return <ErroRelatorio erro={q.error} aoTentarDeNovo={() => void q.refetch()} />

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile rotulo="Pedidos com problema" carregando={q.isPending} valor={d ? String(d.total_problemas) : null} tom="barro" icone={<CircleAlert className="size-4" aria-hidden />} detalhe={d ? `de ${d.total_pedidos} no período` : undefined} />
        <Tile rotulo="Taxa de problema" carregando={q.isPending} valor={d ? (d.taxa_problema === null ? '-' : `${(d.taxa_problema * 100).toFixed(1).replace('.', ',')}%`) : null} icone={<Percent className="size-4" aria-hidden />} />
        <Tile rotulo="Valor perdido" carregando={q.isPending} valor={d ? formatarCentavos(d.valor_perdido_centavos) : null} tom="barro" icone={<Wallet className="size-4" aria-hidden />} />
      </div>
      <Card>
        <h2 className="text-lg text-salvia">Motivos</h2>
        <div className="mt-3">
          {q.isPending ? (
            <div className="grid gap-2" aria-busy="true"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-2/3" /></div>
          ) : d && d.motivos.length === 0 ? (
            <EmptyState icone={<CircleAlert className="size-7" aria-hidden />} titulo="Nenhum problema no período" descricao="Pedidos marcados com problema aparecem aqui, agrupados pelo motivo." />
          ) : (
            <ul className="flex flex-col gap-3.5">
              {(() => {
                const maxValor = Math.max(1, ...(d?.motivos ?? []).map((m) => m.valor_centavos))
                return d?.motivos.map((m) => (
                  <li key={m.motivo} className="text-sm">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 break-words text-tinta first-letter:uppercase">{m.motivo}</span>
                      <span className="tabular flex-none text-tinta-2">{m.pedidos} {m.pedidos === 1 ? 'pedido' : 'pedidos'}</span>
                      <span className="tabular w-24 flex-none text-right text-tinta">{formatarCentavos(m.valor_centavos)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-papel-2" aria-hidden>
                      <div className="h-full rounded-pill bg-barro/70" style={{ width: `${Math.max(3, Math.round((m.valor_centavos / maxValor) * 100))}%` }} />
                    </div>
                  </li>
                ))
              })()}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
