// "O que compram": itens mais vendidos da loja numa janela de dias.
import { ShoppingBag } from 'lucide-react'
import { EmptyState, ErrorState, MoneyText, Select, Skeleton, TableResponsive, type ColunaTabela } from '@/shared/ui'
import { useCrmItens, type CrmItens } from '../api'

type Item = CrmItens['itens'][number]

const COLUNAS: ReadonlyArray<ColunaTabela<Item>> = [
  { chave: 'nome', titulo: 'Item', principal: true, render: (i) => <span className="font-medium">{i.nome}</span> },
  { chave: 'qtd', titulo: 'Vendidos', alinhar: 'direita', render: (i) => <span className="tabular-nums">{i.quantidade}</span> },
  { chave: 'clientes', titulo: 'Clientes', alinhar: 'direita', render: (i) => <span className="tabular-nums">{i.clientes}</span> },
  { chave: 'fat', titulo: 'Faturamento', alinhar: 'direita', render: (i) => <MoneyText centavos={i.faturamento_centavos} /> },
]

const JANELAS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 180 dias' },
  { value: '365', label: 'Último ano' },
] as const

export function ItensVendidos({ dias, aoMudarDias }: { dias: number; aoMudarDias: (d: number) => void }) {
  const consulta = useCrmItens(dias)
  return (
    <div className="flex flex-col gap-4">
      <Select
        ariaLabel="Período"
        value={String(dias)}
        onChange={(v) => aoMudarDias(Number(v))}
        options={JANELAS}
        className="w-full sm:w-56"
      />
      {consulta.isPending && (
        <div aria-busy="true" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {consulta.isError && <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.isSuccess && consulta.data.itens.length === 0 && (
        <EmptyState
          icone={<ShoppingBag className="size-7" aria-hidden />}
          titulo="Sem vendas no período"
          descricao="Quando houver pedidos entregues, os itens mais pedidos aparecem aqui."
        />
      )}
      {consulta.isSuccess && consulta.data.itens.length > 0 && (
        <TableResponsive
          colunas={COLUNAS}
          linhas={consulta.data.itens}
          chaveLinha={(i) => i.item_id ?? i.nome}
          legenda="Itens mais vendidos"
        />
      )}
    </div>
  )
}
