// Detalhe de uma execucao: KPIs do resumo, score por metrica, tabela de resultados por caso (cada
// linha expande para mostrar a saida e o erro) e as acoes de baseline, comparacao e cancelamento.
import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  MeterBar,
  Select,
  Skeleton,
  StatCard,
  TableResponsive,
  useToast,
  type ColunaTabela,
  type SelectOption,
} from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { EvalExecucao, EvalResultado, EvalResumo } from '@/shared/contracts/_generated/plataforma_evals'
import { useCancelarExecucao, useCasos, useDefinirBaseline, useExecucao, useExecucoes, useSuites } from '../api'
import {
  emAndamento,
  inteiro,
  ms,
  pct,
  reais,
  ROTULO_STATUS_EXECUCAO,
  ROTULO_STATUS_RESULTADO,
  rotuloExecucao,
  ROTULO_TIPO,
  TOM_STATUS_EXECUCAO,
  TOM_STATUS_RESULTADO,
} from '../rotulos'
import { AreaErro } from './AreaErro'

function Kpis({ resumo }: { resumo: EvalResumo }) {
  const taxa = resumo.total > 0 ? resumo.passou / resumo.total : null
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard rotulo="Taxa de aprovação" valor={pct(taxa)} detalhe={`${resumo.passou} de ${resumo.total} casos`} tom="salvia" destaque />
      <StatCard rotulo="Score médio" valor={pct(resumo.scoreMedio)} detalhe={`${resumo.falhou} falharam, ${resumo.erro} com erro`} />
      <StatCard rotulo="Custo" valor={reais(resumo.custoCentavos)} detalhe={`${inteiro(resumo.tokensIn)} tokens de entrada, ${inteiro(resumo.tokensOut)} de saída`} />
      <StatCard rotulo="Latência" valor={ms(resumo.latenciaP50Ms)} detalhe={`P95: ${ms(resumo.latenciaP95Ms)}`} />
    </div>
  )
}

function PorMetrica({ metricas }: { metricas: Record<string, number> }) {
  const itens = Object.entries(metricas)
  if (itens.length === 0) return null
  return (
    <Card>
      <h3 className="mb-3 text-base text-salvia">Score por métrica</h3>
      <ul className="flex flex-col gap-3">
        {itens.map(([nome, valor]) => (
          <li key={nome}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-tinta">{nome}</span>
              <span className="tabular text-tinta-2">{pct(valor)}</span>
            </div>
            <MeterBar valor={valor * 100} rotulo={`${nome}: ${pct(valor)}`} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Saida({ r }: { r: EvalResultado }) {
  const scores = Object.entries(r.scores)
  return (
    <div className="mt-3 flex flex-col gap-3 text-left">
      {r.erro && <Banner tom="erro">{r.erro}</Banner>}
      {scores.length > 0 && (
        <p className="text-xs text-tinta-2">{scores.map(([k, v]) => `${k}: ${pct(v)}`).join(' | ')}</p>
      )}
      {r.saida ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-input bg-papel-2 p-3 text-xs text-tinta">
          {JSON.stringify(r.saida, null, 2)}
        </pre>
      ) : (
        !r.erro && <p className="text-xs text-tinta-2">Sem saída registrada.</p>
      )}
    </div>
  )
}

function TabelaResultados({ resultados, suiteId, ehRetrieval }: { resultados: ReadonlyArray<EvalResultado>; suiteId: string; ehRetrieval: boolean }) {
  const casos = useCasos(ehRetrieval ? null : suiteId)
  const nomes = useMemo(() => new Map((casos.data ?? []).map((c) => [c.id, c.nome])), [casos.data])
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set())
  const alternar = (id: string) =>
    setAbertos((a) => {
      const n = new Set(a)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const colunas: ReadonlyArray<ColunaTabela<EvalResultado>> = [
    {
      chave: 'caso',
      titulo: 'Caso',
      principal: true,
      render: (r) => {
        const idx = resultados.indexOf(r) + 1
        const nome = r.caso_id ? (nomes.get(r.caso_id) ?? 'Caso') : `Pergunta ${idx}`
        const aberto = abertos.has(r.id)
        const Seta = aberto ? ChevronDown : ChevronRight
        return (
          <div>
            <button
              type="button"
              aria-expanded={aberto}
              onClick={() => alternar(r.id)}
              className="flex min-h-11 items-center gap-1.5 text-left font-medium text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
            >
              <Seta className="size-4 flex-none text-tinta-2" aria-hidden />
              {nome}
            </button>
            {aberto && <Saida r={r} />}
          </div>
        )
      },
    },
    { chave: 'status', titulo: 'Status', render: (r) => <Badge tom={TOM_STATUS_RESULTADO[r.status]}>{ROTULO_STATUS_RESULTADO[r.status]}</Badge> },
    {
      chave: 'scores',
      titulo: 'Scores',
      render: (r) => {
        const e = Object.entries(r.scores)
        return <span className="tabular text-tinta-2">{e.length === 0 ? '-' : e.map(([k, v]) => `${k} ${pct(v)}`).join(', ')}</span>
      },
    },
  ]

  return <TableResponsive colunas={colunas} linhas={resultados} chaveLinha={(r) => r.id} legenda="Resultados por caso" />
}

function Acoes({ execucao, aoComparar }: { execucao: EvalExecucao; aoComparar: (a: string, b: string) => void }) {
  const outras = useExecucoes({ suiteId: execucao.suite_id, status: 'concluida' })
  const baseline = useDefinirBaseline()
  const { mostrarToast } = useToast()
  const [outraId, setOutraId] = useState('')

  const candidatas = (outras.data ?? []).filter((e) => e.id !== execucao.id)
  const opcoes: ReadonlyArray<SelectOption<string>> = [
    { value: '', label: 'Escolha outra execução da suite' },
    ...candidatas.map((e) => ({ value: e.id, label: rotuloExecucao(e) })),
  ]

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-base text-salvia">Baseline e comparação</h3>
      {execucao.baseline_execucao_id && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-tinta-2">
          Baseline atual definida.
          <Button variante="secondary" onClick={() => aoComparar(execucao.baseline_execucao_id as string, execucao.id)}>
            Comparar com a baseline
          </Button>
        </div>
      )}
      <Select ariaLabel="Outra execução da mesma suite" value={outraId} onChange={setOutraId} options={opcoes} />
      <div className="flex flex-wrap gap-2">
        <Button
          variante="secondary"
          disabled={outraId === ''}
          loading={baseline.isPending}
          onClick={() =>
            baseline.mutate(
              { execucaoId: execucao.id, baselineId: outraId },
              {
                onSuccess: () => mostrarToast('Baseline definida.', { tom: 'sucesso' }),
                onError: () => mostrarToast('Não foi possível definir a baseline.', { tom: 'erro' }),
              },
            )
          }
        >
          Definir como baseline desta execução
        </Button>
        <Button disabled={outraId === ''} onClick={() => aoComparar(outraId, execucao.id)}>
          Comparar com...
        </Button>
      </div>
      {outras.isSuccess && candidatas.length === 0 && <p className="text-xs text-tinta-2">Ainda não há outra execução concluída desta suite.</p>}
    </Card>
  )
}

export function DetalheExecucao({
  id,
  aoVoltar,
  aoComparar,
}: {
  id: string
  aoVoltar: () => void
  aoComparar: (a: string, b: string) => void
}) {
  const detalhe = useExecucao(id)
  const suites = useSuites()
  const cancelar = useCancelarExecucao()
  const { mostrarToast } = useToast()

  const voltar = (
    <Button variante="ghost" onClick={aoVoltar} className="self-start">
      <ArrowLeft className="size-4" aria-hidden />
      Execuções
    </Button>
  )

  if (detalhe.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando execução">
        {voltar}
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (detalhe.isError) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <AreaErro erro={detalhe.error} aoTentarDeNovo={() => void detalhe.refetch()} />
      </div>
    )
  }

  const { execucao, resultados } = detalhe.data
  const suite = suites.data?.find((s) => s.id === execucao.suite_id)
  const rodando = emAndamento(execucao.status)

  return (
    <div className="flex flex-col gap-4">
      {voltar}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl text-salvia">{suite?.nome ?? 'Execução'}</h2>
        <Badge tom={TOM_STATUS_EXECUCAO[execucao.status]}>{ROTULO_STATUS_EXECUCAO[execucao.status]}</Badge>
        {suite && <Badge>{ROTULO_TIPO[suite.tipo]}</Badge>}
      </div>
      <p className="text-sm text-tinta-2">
        {execucao.modelo ?? 'Modelo padrão da loja'}
        {execucao.provedor ? ` (${execucao.provedor})` : ''} | criada em {formatarDataHora(execucao.criada_em)}
        {execucao.concluida_em ? ` | concluída em ${formatarDataHora(execucao.concluida_em)}` : ''}
      </p>

      {rodando && (
        <Banner tom="info">
          Execução {execucao.status === 'fila' ? 'na fila' : 'em andamento'}. Esta tela atualiza sozinha.
          <Button
            variante="secondary"
            className="ml-3"
            loading={cancelar.isPending}
            onClick={() =>
              cancelar.mutate(execucao.id, { onError: () => mostrarToast('Não foi possível cancelar.', { tom: 'erro' }) })
            }
          >
            Cancelar
          </Button>
        </Banner>
      )}
      {execucao.erro && <Banner tom="erro">{execucao.erro}</Banner>}

      {execucao.resumo && <Kpis resumo={execucao.resumo} />}
      {execucao.resumo && <PorMetrica metricas={execucao.resumo.porMetrica} />}
      {execucao.status === 'concluida' && <Acoes execucao={execucao} aoComparar={aoComparar} />}

      <section aria-label="Resultados" className="flex flex-col gap-3">
        <h3 className="text-base text-salvia">Resultados</h3>
        {resultados.length === 0 ? (
          <p className="text-sm text-tinta-2">{rodando ? 'Os resultados aparecem aqui conforme os casos terminam.' : 'Nenhum resultado registrado.'}</p>
        ) : (
          <TabelaResultados resultados={resultados} suiteId={execucao.suite_id} ehRetrieval={suite?.tipo === 'rag_retrieval'} />
        )}
      </section>
    </div>
  )
}
