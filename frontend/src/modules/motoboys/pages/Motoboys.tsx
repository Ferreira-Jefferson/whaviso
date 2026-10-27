// /motoboys: cadastro de entrega dos motoboys (pessoas de cargo motoboy) e fechamento do dia.
// Duas abas: "Cadastro" (lista + cadastro/edicao) e "Fechamento" (quanto cada um recebe no dia,
// ajustes e pagamento). PII: telefone e Pix so MASCARADOS (ultimos 4), como a api devolve.
import { useState } from 'react'
import { Bike, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  Tabs,
  type ColunaTabela,
  type TabItem,
} from '@/shared/ui'
import { useMotoboys, type Motoboy } from '../api'
import { MotoboyDialog } from '../components/MotoboyDialog'
import { PainelFechamento } from '../components/PainelFechamento'
import { ROTULO_PIX, ROTULO_VEICULO } from '../estados'

export default function Motoboys() {
  const [aba, setAba] = useState('cadastro')

  const abas: ReadonlyArray<TabItem> = [
    { id: 'cadastro', rotulo: 'Cadastro', conteudo: <PainelCadastro /> },
    { id: 'fechamento', rotulo: 'Fechamento do dia', conteudo: <PainelFechamento /> },
  ]

  return (
    <div>
      <PageHeader titulo="Motoboys" descricao="Quem entrega para a sua loja e quanto cada um recebe." />
      <Tabs itens={abas} ativa={aba} aoMudar={setAba} ariaLabel="Seções de motoboys" />
    </div>
  )
}

const COLUNAS: ReadonlyArray<ColunaTabela<Motoboy>> = [
  {
    chave: 'nome',
    titulo: 'Motoboy',
    principal: true,
    render: (m) => (
      <span className="flex items-center gap-2 font-medium">
        {m.nome}
        {!m.ativo && <Badge tom="neutro">Arquivado</Badge>}
      </span>
    ),
  },
  {
    chave: 'veiculo',
    titulo: 'Veículo',
    render: (m) => (
      <span className="text-tinta-2">
        {ROTULO_VEICULO[m.veiculo]}
        {m.placa ? ` · ${m.placa}` : ''}
      </span>
    ),
  },
  {
    chave: 'telefone',
    titulo: 'Telefone',
    render: (m) => (
      <span className="tabular text-tinta-2">{m.telefone_ultimos4 ? `final ${m.telefone_ultimos4}` : 'Não informado'}</span>
    ),
  },
  {
    chave: 'pix',
    titulo: 'Pix',
    render: (m) => (
      <span className="tabular text-tinta-2">
        {m.pix_ultimos4 ? `${m.pix_tipo ? ROTULO_PIX[m.pix_tipo] : 'Pix'} final ${m.pix_ultimos4}` : 'Não informado'}
      </span>
    ),
  },
]

function PainelCadastro() {
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [editando, setEditando] = useState<Motoboy | null>(null)
  const [criando, setCriando] = useState(false)

  const lista = useMotoboys(incluirInativos)
  const itens = lista.data?.itens ?? []
  const vazio = lista.isSuccess && itens.length === 0

  const fechar = () => {
    setEditando(null)
    setCriando(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          ariaLabel="Filtrar por situação"
          value={incluirInativos ? 'todos' : 'ativos'}
          onChange={(v) => setIncluirInativos(v === 'todos')}
          options={[
            { value: 'ativos', label: 'Ativos' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
        <Button onClick={() => setCriando(true)}>
          <Plus className="size-4" aria-hidden />
          Novo motoboy
        </Button>
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando motoboys" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}

      {vazio && (
        <EmptyState
          icone={<Bike className="size-7" aria-hidden />}
          titulo={incluirInativos ? 'Nenhum motoboy cadastrado' : 'Ainda sem motoboys ativos'}
          descricao="Cadastre quem faz as entregas para atribuir pedidos e fechar o dia."
          acao={
            <Button onClick={() => setCriando(true)}>
              <Plus className="size-4" aria-hidden />
              Novo motoboy
            </Button>
          }
        />
      )}

      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive
          colunas={COLUNAS}
          linhas={itens}
          chaveLinha={(m) => m.id}
          onRowClick={(m) => setEditando(m)}
          legenda="Lista de motoboys"
        />
      )}

      <MotoboyDialog aberto={criando || editando != null} motoboy={editando} aoFechar={fechar} />
    </div>
  )
}
