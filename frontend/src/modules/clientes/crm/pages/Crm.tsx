// CRM do restaurante: segmentos RFM, lista de consumidores com filtros, ficha por cliente
// (historico, RFM, o que compra) e opt-out de marketing. Rota /crm. Nada e calculado no cliente:
// segmentos e notas vem da view do backend. Sem telefone nesta tela (PII fica em /clientes).
import { useMemo, useState } from 'react'
import { BellOff, Users } from 'lucide-react'
import { formatarData } from '@/shared/format'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  MoneyText,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  Tabs,
  type ColunaTabela,
} from '@/shared/ui'
import { useCrmClientes, useCrmResumo, type CrmCliente, type CrmSegmento } from '../api'
import { FichaClienteDialog } from '../components/FichaClienteDialog'
import { ItensVendidos } from '../components/ItensVendidos'
import { ResumoSegmentos } from '../components/ResumoSegmentos'
import { SeloSegmento } from '../components/SeloSegmento'
import { ROTULO_SEGMENTO } from '../segmentos'

const COLUNAS: ReadonlyArray<ColunaTabela<CrmCliente>> = [
  {
    chave: 'nome',
    titulo: 'Cliente',
    principal: true,
    render: (c) => (
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{c.nome ?? 'Cliente sem nome'}</span>
        {c.opt_out_marketing && (
          <Badge tom="erro">
            <BellOff className="mr-1 size-3" aria-hidden />
            Não contactar
          </Badge>
        )}
      </span>
    ),
  },
  { chave: 'segmento', titulo: 'Segmento', render: (c) => <SeloSegmento segmento={c.segmento} /> },
  { chave: 'pedidos', titulo: 'Pedidos', alinhar: 'direita', render: (c) => <span className="tabular-nums">{c.pedidos_total}</span> },
  { chave: 'gasto', titulo: 'Gasto em 180 dias', alinhar: 'direita', render: (c) => <MoneyText centavos={c.gasto_180d_centavos} /> },
  {
    chave: 'ultima',
    titulo: 'Última compra',
    alinhar: 'direita',
    render: (c) => (
      <span className="tabular-nums text-tinta-2">{c.ultimo_pedido_em ? formatarData(c.ultimo_pedido_em) : 'Nenhuma'}</span>
    ),
  },
]

type Visao = 'clientes' | 'itens'
type Contato = 'todos' | 'contactaveis'

export default function Crm() {
  const [visao, setVisao] = useState<Visao>('clientes')
  const [segmento, setSegmento] = useState<CrmSegmento | null>(null)
  const [contato, setContato] = useState<Contato>('todos')
  const [dias, setDias] = useState(90)
  const [abertoId, setAbertoId] = useState<string | null>(null)

  const resumo = useCrmResumo()
  const lista = useCrmClientes({ segmento, soContactaveis: contato === 'contactaveis' })
  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.itens) ?? [], [lista.data])
  const filtrando = segmento != null || contato === 'contactaveis'

  const painelClientes = (
    <div className="flex flex-col gap-4">
      <ResumoSegmentos resumo={resumo.data} carregando={resumo.isPending} segmentoAtivo={segmento} aoEscolher={setSegmento} />
      {resumo.isError && <ErrorState aoTentarDeNovo={() => void resumo.refetch()} />}

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Quem listar"
          value={contato}
          onChange={setContato}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'contactaveis', label: 'Só quem pode receber campanha' },
          ]}
        />
        {segmento && (
          <Button variante="ghost" onClick={() => setSegmento(null)}>
            Segmento: {ROTULO_SEGMENTO[segmento]} (limpar)
          </Button>
        )}
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando clientes" className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<Users className="size-7" aria-hidden />}
          titulo={filtrando ? 'Nenhum cliente neste filtro' : 'Ainda sem clientes'}
          descricao={
            filtrando
              ? 'Tente outro segmento ou mostre todos.'
              : 'Quando alguém concluir um pedido pelo WhatsApp, o cliente aparece aqui com o segmento.'
          }
        />
      )}
      {lista.isSuccess && itens.length > 0 && (
        <>
          <TableResponsive
            colunas={COLUNAS}
            linhas={itens}
            chaveLinha={(c) => c.cliente_id}
            onRowClick={(c) => setAbertoId(c.cliente_id)}
            legenda="Consumidores e segmentos"
          />
          {lista.hasNextPage && (
            <div className="flex justify-center">
              <Button variante="secondary" loading={lista.isFetchingNextPage} onClick={() => void lista.fetchNextPage()}>
                Ver mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader titulo="CRM" descricao="Quem compra, quanto e com que frequência." />
      <Tabs
        ariaLabel="Visões do CRM"
        ativa={visao}
        aoMudar={(id) => setVisao(id as Visao)}
        itens={[
          { id: 'clientes', rotulo: 'Clientes', conteudo: painelClientes },
          { id: 'itens', rotulo: 'O que compram', conteudo: <ItensVendidos dias={dias} aoMudarDias={setDias} /> },
        ]}
      />
      <FichaClienteDialog id={abertoId} aoFechar={() => setAbertoId(null)} />
    </div>
  )
}
