// Equipe da loja: pessoas que trabalham a favor dela (nao so CLT: motoboy, churrasqueiro de
// fim de semana). Duas abas: "Equipe" (lista + cadastro + escala) e "Cargos" (funcoes).
// PII: o telefone da pessoa aparece so MASCARADO na lista (o backend ja mascara).
import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  Tabs,
  type ColunaTabela,
  type TabItem,
} from '@/shared/ui'
import { usePessoas, type Pessoa } from '../api'
import { PessoaDialog } from '../components/PessoaDialog'
import { PainelCargos } from '../components/PainelCargos'

export default function Pessoas() {
  const [aba, setAba] = useState('equipe')

  const abas: ReadonlyArray<TabItem> = [
    { id: 'equipe', rotulo: 'Equipe', conteudo: <PainelEquipe /> },
    { id: 'cargos', rotulo: 'Cargos', conteudo: <PainelCargos /> },
  ]

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl text-salvia sm:text-3xl">Pessoas</h1>
        <p className="mt-1 text-sm text-tinta-2">Quem trabalha a favor da sua loja.</p>
        <div className="mt-4 h-px w-full bg-linha" />
      </header>

      <Tabs itens={abas} ativa={aba} aoMudar={setAba} ariaLabel="Secoes de pessoas" />
    </div>
  )
}

const COLUNAS: ReadonlyArray<ColunaTabela<Pessoa>> = [
  {
    chave: 'nome',
    titulo: 'Pessoa',
    principal: true,
    render: (p) => (
      <span className="flex items-center gap-2 font-medium">
        {p.nome}
        {!p.ativo && <Badge tom="neutro">Arquivada</Badge>}
      </span>
    ),
  },
  {
    chave: 'cargo',
    titulo: 'Cargo',
    render: (p) => <span className="text-tinta-2">{p.cargo_nome}</span>,
  },
  {
    chave: 'telefone',
    titulo: 'Telefone',
    render: (p) => <span className="tabular text-tinta-2">{p.telefone_mascarado ?? 'Nao informado'}</span>,
  },
]

function PainelEquipe() {
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  const lista = usePessoas(incluirInativos)
  const itens = lista.data?.itens ?? []
  const vazio = lista.isSuccess && itens.length === 0

  const fechar = () => {
    setEditandoId(null)
    setCriando(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          ariaLabel="Filtrar por situacao"
          value={incluirInativos ? 'todas' : 'ativas'}
          onChange={(v) => setIncluirInativos(v === 'todas')}
          options={[
            { value: 'ativas', label: 'Ativas' },
            { value: 'todas', label: 'Todas' },
          ]}
        />
        <Button onClick={() => setCriando(true)}>
          <Plus className="size-4" aria-hidden />
          Nova pessoa
        </Button>
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando equipe" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}

      {vazio && (
        <EmptyState
          icone={<Users className="size-7" aria-hidden />}
          titulo={incluirInativos ? 'Nenhuma pessoa cadastrada' : 'Ainda sem pessoas ativas'}
          descricao="Cadastre quem trabalha na sua loja para montar as escalas."
        />
      )}

      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive
          colunas={COLUNAS}
          linhas={itens}
          chaveLinha={(p) => p.id}
          onRowClick={(p) => setEditandoId(p.id)}
          legenda="Lista da equipe"
        />
      )}

      <PessoaDialog aberto={criando || editandoId != null} pessoaId={editandoId} aoFechar={fechar} />
    </div>
  )
}
