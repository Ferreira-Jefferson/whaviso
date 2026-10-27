// Coortes mensais de clientes (mes do primeiro pedido) e retencao nos meses seguintes.
// So contagens: nenhum cliente e identificado. A matriz rola dentro do proprio cartao.
import { Users } from 'lucide-react'
import { Card, EmptyState, Skeleton, cn } from '@/shared/ui'
import { useCoortes } from '../api'
import type { Periodo } from '../periodo'
import { ErroRelatorio } from './ErroRelatorio'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function rotuloMes(mes: string): string {
  const [ano = '', m = '1'] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? m}/${ano.slice(2)}`
}

export function SecaoCoortes({ periodo }: { periodo: Periodo }) {
  const q = useCoortes(periodo)
  const d = q.data

  if (q.isError) return <ErroRelatorio erro={q.error} aoTentarDeNovo={() => void q.refetch()} />

  const colunas = d ? Math.max(0, ...d.coortes.flatMap((c) => c.retencao.map((r) => r.offset))) + 1 : 0

  return (
    <Card>
      <h2 className="text-lg text-salvia">Retenção de clientes</h2>
      <p className="mt-0.5 text-xs text-tinta-2">
        Cada linha reúne os clientes que fizeram o primeiro pedido naquele mês. As colunas mostram quantos voltaram a pedir nos meses seguintes.
      </p>
      <div className="mt-4">
        {q.isPending ? (
          <div className="grid gap-2" aria-busy="true"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-2/3" /></div>
        ) : d && d.coortes.length === 0 ? (
          <EmptyState icone={<Users className="size-7" aria-hidden />} titulo="Ainda não há coortes" descricao="Quando houver clientes com pedidos em mais de um mês, a retenção aparece aqui." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Retenção de clientes por mês de estreia</caption>
                <thead>
                  <tr className="text-xs text-tinta-2">
                    <th scope="col" className="sticky left-0 z-10 border-r border-linha bg-cartao px-2 py-2 text-left font-medium">Estreia</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Clientes</th>
                    {Array.from({ length: colunas }, (_, i) => (
                      <th key={i} scope="col" className="min-w-14 px-1.5 py-2 text-center font-medium">{i === 0 ? 'Mês 0' : `+${i}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d?.coortes.map((c) => {
                    const porOffset = new Map(c.retencao.map((r) => [r.offset, r]))
                    return (
                      <tr key={c.mes} className="border-t border-linha">
                        <th scope="row" className="sticky left-0 z-10 border-r border-linha bg-cartao px-2 py-2 text-left font-medium text-tinta">{rotuloMes(c.mes)}</th>
                        <td className="tabular px-2 py-2 text-right text-tinta">{c.clientes}</td>
                        {Array.from({ length: colunas }, (_, i) => {
                          const r = porOffset.get(i)
                          if (!r || r.taxa === null) return <td key={i} className="px-1 py-1 text-center text-xs text-tinta-2" aria-hidden>·</td>
                          const pct = Math.round(r.taxa * 100)
                          return (
                            <td key={i} className="px-1 py-1">
                              <div
                                className={cn(
                                  'tabular rounded-sm px-1.5 py-1.5 text-center text-xs',
                                  // Acima de ~48% o fundo salvia fica escuro: texto claro para manter contraste.
                                  pct >= 48 ? 'text-sobre-marca' : 'text-tinta',
                                )}
                                style={{ backgroundColor: `color-mix(in srgb, var(--color-salvia) ${Math.max(6, pct)}%, transparent)` }}
                                title={`${r.clientes} de ${c.clientes} clientes (${pct}%)`}
                              >
                                {pct}%
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-tinta-2">
              <span>Menos retenção</span>
              <span className="flex-1 overflow-hidden rounded-pill" aria-hidden>
                <span className="block h-2 w-full" style={{ background: 'linear-gradient(to right, color-mix(in srgb, var(--color-salvia) 6%, transparent), var(--color-salvia))' }} />
              </span>
              <span>Mais</span>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
