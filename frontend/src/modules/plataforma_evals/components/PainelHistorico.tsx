// Historico de execucoes: filtros por suite, modelo e status; linha abre o detalhe. A consulta
// reatualiza sozinha enquanto houver execucao na fila ou rodando (ver useExecucoes).
import { useEffect, useMemo, useState } from 'react'
import { History, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Select,
  Skeleton,
  TableResponsive,
  type ColunaTabela,
  type SelectOption,
} from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import {
  evalStatusExecucaoValores,
  type EvalExecucao,
  type EvalStatusExecucao,
} from '@/shared/contracts/_generated/plataforma_evals'
import { useExecucoes, useLojasAlvo, useSuites } from '../api'
import { pct, reais, ROTULO_STATUS_EXECUCAO, TOM_STATUS_EXECUCAO } from '../rotulos'
import { AreaErro } from './AreaErro'

type FiltroStatus = EvalStatusExecucao | 'todos'

const OPCOES_STATUS: ReadonlyArray<SelectOption<FiltroStatus>> = [
  { value: 'todos', label: 'Todos os status' },
  ...evalStatusExecucaoValores.map((s) => ({ value: s, label: ROTULO_STATUS_EXECUCAO[s] })),
]

function useDebounce<T>(valor: T, atrasoMs: number): T {
  const [atual, setAtual] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setAtual(valor), atrasoMs)
    return () => clearTimeout(t)
  }, [valor, atrasoMs])
  return atual
}

export function PainelHistorico({ aoAbrir, aoNova }: { aoAbrir: (id: string) => void; aoNova: () => void }) {
  const [suiteId, setSuiteId] = useState('todas')
  const [status, setStatus] = useState<FiltroStatus>('todos')
  const [textoModelo, setTextoModelo] = useState('')
  const modelo = useDebounce(textoModelo.trim(), 300)

  const suites = useSuites()
  const lojas = useLojasAlvo()
  const lista = useExecucoes({
    suiteId: suiteId === 'todas' ? undefined : suiteId,
    status: status === 'todos' ? undefined : status,
    modelo: modelo === '' ? undefined : modelo,
  })

  const nomeSuite = useMemo(() => new Map((suites.data ?? []).map((s) => [s.id, s.nome])), [suites.data])
  const nomeLoja = useMemo(() => new Map((lojas.data ?? []).map((l) => [l.id, l.nome])), [lojas.data])
  const opcoesSuite: ReadonlyArray<SelectOption<string>> = [
    { value: 'todas', label: 'Todas as suites' },
    ...(suites.data ?? []).map((s) => ({ value: s.id, label: s.nome })),
  ]
  const filtrando = suiteId !== 'todas' || status !== 'todos' || modelo !== ''

  const colunas: ReadonlyArray<ColunaTabela<EvalExecucao>> = [
    {
      chave: 'suite',
      titulo: 'Suite',
      principal: true,
      render: (e) => <span className="font-medium text-tinta">{nomeSuite.get(e.suite_id) ?? 'Suite removida'}</span>,
    },
    { chave: 'status', titulo: 'Status', render: (e) => <Badge tom={TOM_STATUS_EXECUCAO[e.status]}>{ROTULO_STATUS_EXECUCAO[e.status]}</Badge> },
    { chave: 'modelo', titulo: 'Modelo', render: (e) => <span className="text-tinta-2">{e.modelo ?? 'Padrão da loja'}</span> },
    { chave: 'loja', titulo: 'Loja-alvo', render: (e) => <span className="text-tinta-2">{nomeLoja.get(e.loja_alvo_id) ?? 'Loja'}</span> },
    { chave: 'score', titulo: 'Score', alinhar: 'direita', render: (e) => <span className="tabular">{e.resumo ? pct(e.resumo.scoreMedio) : '-'}</span> },
    { chave: 'custo', titulo: 'Custo', alinhar: 'direita', render: (e) => <span className="tabular">{e.resumo ? reais(e.resumo.custoCentavos) : '-'}</span> },
    { chave: 'data', titulo: 'Data', render: (e) => <span className="tabular text-tinta-2">{formatarDataHora(e.criada_em)}</span> },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select ariaLabel="Filtrar por suite" value={suiteId} onChange={setSuiteId} options={opcoesSuite} className="w-full sm:w-56" />
        <Select ariaLabel="Filtrar por status" value={status} onChange={setStatus} options={OPCOES_STATUS} className="w-full sm:w-48" />
        <Input
          value={textoModelo}
          onChange={(e) => setTextoModelo(e.target.value)}
          placeholder="Filtrar por modelo"
          aria-label="Filtrar por modelo"
          maxLength={120}
          className="min-w-44 flex-1"
        />
        <Button onClick={aoNova}>
          <Plus className="size-4" aria-hidden />
          Nova execução
        </Button>
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando execuções" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && lista.data.length === 0 && (
        <EmptyState
          icone={<History className="size-7" aria-hidden />}
          titulo={filtrando ? 'Nenhuma execução encontrada' : 'Ainda não há execuções'}
          descricao={filtrando ? 'Ajuste os filtros.' : 'Dispare uma execução para ver o resultado aqui.'}
        />
      )}
      {lista.isSuccess && lista.data.length > 0 && (
        <TableResponsive colunas={colunas} linhas={lista.data} chaveLinha={(e) => e.id} onRowClick={(e) => aoAbrir(e.id)} legenda="Histórico de execuções" />
      )}
    </div>
  )
}
