// Visao do DONO DA LOJA: as faturas da Whaviso da propria conta (escopo de loja, nao de operador).
// So o DTO enxuto (competencia, valor, vencimento, situacao); nada de outra conta. 403 para quem
// nao e dono. Pagina para o integrador encaixar no shell da loja (ex.: rota /fatura ou em Conta).
import { Receipt } from 'lucide-react'
import { Badge, EmptyState, MoneyText, PageHeader, Skeleton, TableResponsive, type ColunaTabela } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { MinhaFaturaDTO } from '@/shared/contracts/_generated/plataforma_cobranca'
import { useMinhasFaturas } from '../api'
import { AreaErro } from '../components/AreaErro'
import { ROTULO_STATUS_FATURA, TOM_STATUS_FATURA, competenciaLonga, dataNegocio } from '../rotulos'

const COLUNAS: ReadonlyArray<ColunaTabela<MinhaFaturaDTO>> = [
  { chave: 'competencia', titulo: 'Referência', principal: true, render: (f) => <span className="font-medium">{competenciaLonga(f.competencia)}</span> },
  { chave: 'valor', titulo: 'Valor', alinhar: 'direita', render: (f) => <MoneyText centavos={f.valor_centavos} /> },
  { chave: 'vencimento', titulo: 'Vencimento', render: (f) => <span className="tabular text-tinta-2">{dataNegocio(f.vencimento)}</span> },
  {
    chave: 'status',
    titulo: 'Situação',
    render: (f) => (
      <span className="flex flex-col gap-0.5">
        <Badge tom={TOM_STATUS_FATURA[f.status]}>{ROTULO_STATUS_FATURA[f.status]}</Badge>
        {f.pago_em && <span className="text-xs text-tinta-2">em {formatarDataHora(f.pago_em)}</span>}
      </span>
    ),
  },
]

export default function MinhaFatura() {
  const faturas = useMinhasFaturas()
  const itens = faturas.data ?? []
  return (
    <div>
      <PageHeader titulo="Minha fatura" descricao="Cobrança da Whaviso para a sua conta." />
      {faturas.isPending && (
        <div aria-busy="true" aria-label="Carregando faturas" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {faturas.isError && <AreaErro deDono erro={faturas.error} aoTentarDeNovo={() => void faturas.refetch()} />}
      {faturas.isSuccess && itens.length === 0 && (
        <EmptyState icone={<Receipt className="size-7" aria-hidden />} titulo="Nenhuma fatura ainda" descricao="Quando a primeira fatura for emitida, ela aparece aqui." />
      )}
      {faturas.isSuccess && itens.length > 0 && (
        <TableResponsive colunas={COLUNAS} linhas={itens} chaveLinha={(f) => f.id} legenda="Minhas faturas" />
      )}
    </div>
  )
}
