// Aba "Fornecedores": lista com filtro de arquivados, cadastro/edicao via dialog. Telefone so
// MASCARADO (ultimos 4), como a api devolve; o claro so no dialog, sob demanda (revelar).
import { useState } from 'react'
import { Plus, Store } from 'lucide-react'
import {
  Badge,
  Button,
  cn,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { useFornecedores, type Fornecedor } from '../api'
import { FornecedorDialog } from './FornecedorDialog'

const COLUNAS: ReadonlyArray<ColunaTabela<Fornecedor>> = [
  {
    chave: 'nome',
    titulo: 'Fornecedor',
    principal: true,
    render: (f) => (
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium">
        <span className="truncate">{f.nome}</span>
        {!f.ativo && <Badge tom="neutro">Arquivado</Badge>}
      </span>
    ),
  },
  {
    chave: 'documento',
    titulo: 'Documento',
    render: (f) => <span className={cn('tabular', f.documento ? 'text-tinta-2' : 'text-tinta-2/60')}>{f.documento ?? 'Nao informado'}</span>,
  },
  {
    chave: 'telefone',
    titulo: 'Telefone',
    render: (f) => (
      <span className={cn('tabular', f.telefone_ultimos4 ? 'text-tinta-2' : 'text-tinta-2/60')}>
        {f.telefone_ultimos4 ? `final ${f.telefone_ultimos4}` : 'Nao informado'}
      </span>
    ),
  },
]

export function PainelFornecedores() {
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [editando, setEditando] = useState<Fornecedor | null>(null)
  const [criando, setCriando] = useState(false)

  const lista = useFornecedores(incluirInativos)
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
          ariaLabel="Filtrar por situacao"
          value={incluirInativos ? 'todos' : 'ativos'}
          onChange={(v) => setIncluirInativos(v === 'todos')}
          options={[
            { value: 'ativos', label: 'Ativos' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
        <Button onClick={() => setCriando(true)} className="max-sm:w-full">
          <Plus className="size-4" aria-hidden />
          Novo fornecedor
        </Button>
      </div>

      {lista.isSuccess && itens.length > 0 && (
        <p className="text-sm text-tinta-2" aria-live="polite">
          {itens.length === 1 ? '1 fornecedor' : `${itens.length} fornecedores`}
        </p>
      )}

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando fornecedores" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}

      {vazio && (
        <EmptyState
          icone={<Store className="size-7" aria-hidden />}
          titulo={incluirInativos ? 'Nenhum fornecedor cadastrado' : 'Ainda sem fornecedores ativos'}
          descricao="Cadastre quem a loja paga para lancar as contas a pagar."
          acao={
            <Button onClick={() => setCriando(true)}>
              <Plus className="size-4" aria-hidden />
              Novo fornecedor
            </Button>
          }
        />
      )}

      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive
          colunas={COLUNAS}
          linhas={itens}
          chaveLinha={(f) => f.id}
          onRowClick={(f) => setEditando(f)}
          legenda="Lista de fornecedores"
        />
      )}

      <FornecedorDialog aberto={criando || editando != null} fornecedor={editando} aoFechar={fechar} />
    </div>
  )
}
