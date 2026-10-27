// /motoboys: cadastro de entrega dos motoboys (pessoas de cargo motoboy) e fechamento do dia.
// Duas abas: "Cadastro" (lista + cadastro/edicao) e "Fechamento" (quanto cada um recebe no dia,
// ajustes e pagamento). PII: telefone e Pix so MASCARADOS (ultimos 4), como a api devolve.
import { useState } from 'react'
import { Bike, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  cn,
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

/** Monograma com as iniciais do motoboy: dá rosto e ritmo à lista sem precisar de foto. */
function Avatar({ nome, inativo }: { nome: string; inativo?: boolean }) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const iniciais =
    ((partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?'
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 flex-none items-center justify-center rounded-full bg-salvia-claro text-xs font-bold text-salvia',
        inativo && 'opacity-50',
      )}
    >
      {iniciais}
    </span>
  )
}

const COLUNAS: ReadonlyArray<ColunaTabela<Motoboy>> = [
  {
    chave: 'nome',
    titulo: 'Motoboy',
    principal: true,
    render: (m) => (
      <span className="flex items-center gap-3">
        <Avatar nome={m.nome} inativo={!m.ativo} />
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <span className="truncate">{m.nome}</span>
          {!m.ativo && <Badge tom="neutro">Arquivado</Badge>}
        </span>
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
      <span className={cn('tabular', m.telefone_ultimos4 ? 'text-tinta-2' : 'text-tinta-2/60')}>
        {m.telefone_ultimos4 ? `final ${m.telefone_ultimos4}` : 'Não informado'}
      </span>
    ),
  },
  {
    chave: 'pix',
    titulo: 'Pix',
    render: (m) => (
      <span className={cn('tabular', m.pix_ultimos4 ? 'text-tinta-2' : 'text-tinta-2/60')}>
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
        <Button onClick={() => setCriando(true)} className="max-sm:w-full">
          <Plus className="size-4" aria-hidden />
          Novo motoboy
        </Button>
      </div>

      {lista.isSuccess && itens.length > 0 && (
        <p className="text-sm text-tinta-2" aria-live="polite">
          {itens.length === 1 ? '1 motoboy' : `${itens.length} motoboys`}
        </p>
      )}

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
