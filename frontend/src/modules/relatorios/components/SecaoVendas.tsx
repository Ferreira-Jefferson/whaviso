// Vendas realizadas (pedidos entregues) agrupadas por uma dimensao escolhida no dropdown.
import { useState } from 'react'
import { Receipt, ShoppingBag, Wallet } from 'lucide-react'
import { Card, EmptyState, MeterBar, SectionHeader, Select, Skeleton, TableResponsive, type ColunaTabela } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import type { VendasSaida } from '@/shared/contracts/_generated/relatorios'
import { useVendas, type VendasDimensao } from '../api'
import type { Periodo } from '../periodo'
import { ErroRelatorio } from './ErroRelatorio'
import { Tile } from './Tile'

const DIMENSOES: ReadonlyArray<{ value: VendasDimensao; label: string; coluna: string }> = [
  { value: 'dia', label: 'Por dia', coluna: 'Dia' },
  { value: 'semana', label: 'Por semana', coluna: 'Semana' },
  { value: 'mes', label: 'Por mês', coluna: 'Mês' },
  { value: 'hora', label: 'Por hora do dia', coluna: 'Hora' },
  { value: 'dia_semana', label: 'Por dia da semana', coluna: 'Dia da semana' },
  { value: 'origem', label: 'Por origem do pedido', coluna: 'Origem' },
  { value: 'modalidade', label: 'Entrega ou retirada', coluna: 'Modalidade' },
  { value: 'categoria', label: 'Por categoria do cardápio', coluna: 'Categoria' },
  { value: 'item', label: 'Por item (mais vendidos)', coluna: 'Item' },
]

type Linha = VendasSaida['linhas'][number]

const pct = (n: number | null) => (n === null ? '-' : `${Math.round(n * 100)}%`)

export function SecaoVendas({ periodo }: { periodo: Periodo }) {
  const [dimensao, setDimensao] = useState<VendasDimensao>('dia')
  const q = useVendas(periodo, dimensao)
  const dim = DIMENSOES.find((d) => d.value === dimensao) ?? { value: dimensao, label: 'Por dia', coluna: 'Dia' }
  const d = q.data
  const porItem = dimensao === 'categoria' || dimensao === 'item'

  const colunas: ColunaTabela<Linha>[] = [
    { chave: 'rotulo', titulo: dim.coluna, principal: true, render: (l) => <span className="font-medium">{l.rotulo}</span> },
    { chave: 'pedidos', titulo: 'Pedidos', alinhar: 'direita', render: (l) => <span className="tabular">{l.pedidos}</span> },
    ...(porItem
      ? [{ chave: 'quantidade', titulo: 'Unidades', alinhar: 'direita' as const, render: (l: Linha) => <span className="tabular">{l.quantidade ?? '-'}</span> }]
      : [{ chave: 'ticket', titulo: 'Ticket médio', alinhar: 'direita' as const, render: (l: Linha) => <span className="tabular">{l.ticket_medio_centavos === null ? '-' : formatarCentavos(l.ticket_medio_centavos)}</span> }]),
    { chave: 'faturamento', titulo: 'Faturamento', alinhar: 'direita', render: (l) => <span className="tabular">{formatarCentavos(l.faturamento_centavos)}</span> },
    {
      chave: 'participacao',
      titulo: 'Participação',
      alinhar: 'direita',
      render: (l) => (
        <span className="inline-flex items-center justify-end gap-2">
          <MeterBar valor={(l.participacao ?? 0) * 100} className="w-16" />
          <span className="tabular w-10 text-right">{pct(l.participacao)}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-tinta-2">Agrupar</span>
        <Select className="w-full sm:w-72" ariaLabel="Agrupar vendas por" value={dimensao} onChange={setDimensao} options={DIMENSOES} />
      </div>

      {q.isError ? (
        <ErroRelatorio erro={q.error} aoTentarDeNovo={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Tile rotulo="Faturamento" carregando={q.isPending} valor={d ? formatarCentavos(d.total_faturamento_centavos) : null} tom="folha" icone={<Wallet className="size-4" aria-hidden />} detalhe="Pedidos entregues" />
            <Tile rotulo="Pedidos entregues" carregando={q.isPending} valor={d ? String(d.total_pedidos) : null} icone={<ShoppingBag className="size-4" aria-hidden />} />
            <Tile rotulo="Ticket médio" carregando={q.isPending} valor={d ? (d.total_pedidos > 0 ? formatarCentavos(Math.round(d.total_faturamento_centavos / d.total_pedidos)) : '-') : null} icone={<Receipt className="size-4" aria-hidden />} />
          </div>
          <div className="grid gap-3">
            <SectionHeader
              titulo={`Vendas ${dim.label.toLowerCase()}`}
              meta={d && d.linhas.length > 0 ? `${d.linhas.length} ${d.linhas.length === 1 ? 'linha' : 'linhas'}` : undefined}
            />
            <Card className="border-0 bg-transparent !p-0 md:border md:border-linha md:bg-cartao md:!p-4">
              {q.isPending ? (
                <div className="grid gap-2.5 p-3" aria-busy="true" aria-label="Carregando vendas">
                  {['w-full', 'w-11/12', 'w-10/12', 'w-9/12', 'w-10/12', 'w-8/12'].map((w, i) => (
                    <Skeleton key={i} className={`h-5 ${w}`} />
                  ))}
                </div>
              ) : d && d.linhas.length === 0 ? (
                <EmptyState icone={<ShoppingBag className="size-7" aria-hidden />} titulo="Sem vendas no período" descricao="Só pedidos entregues entram aqui. Experimente um período maior." />
              ) : (
                d && <TableResponsive legenda={`Vendas ${dim.label.toLowerCase()}`} colunas={colunas} linhas={d.linhas} chaveLinha={(l) => l.chave} />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
