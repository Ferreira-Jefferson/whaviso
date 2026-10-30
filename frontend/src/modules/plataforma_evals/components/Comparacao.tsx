// Comparacao A x B: "mudar o modelo ou a base ajudou?". Deltas sao sempre B menos A; verde melhora,
// ambar piora (custo e latencia menores sao melhores). Tabela por caso destaca os que mudaram.
import { useMemo } from 'react'
import { GitCompare } from 'lucide-react'
import { Badge, Card, EmptyState, Select, Skeleton, StatCard, TableResponsive, type ColunaTabela, type SelectOption } from '@/shared/ui'
import type { EvalDeltasAgregados, EvalDiffCaso } from '@/shared/contracts/_generated/plataforma_evals'
import { useComparacao, useExecucoes, useSuites } from '../api'
import {
  deltaInt,
  deltaPp,
  deltaReais,
  inteiro,
  pct,
  ROTULO_STATUS_RESULTADO,
  rotuloExecucao,
  tomDelta,
  TOM_STATUS_RESULTADO,
} from '../rotulos'
import { AreaErro } from './AreaErro'

type TomCard = 'folha' | 'ambar' | 'neutro'

function tomCard(delta: number | null | undefined, maiorMelhor: boolean): TomCard {
  const t = tomDelta(delta, maiorMelhor)
  return t === 'sucesso' ? 'folha' : t === 'erro' ? 'ambar' : 'neutro'
}

function msDelta(d: number | null): string {
  return d == null ? 'Sem dado' : `${deltaInt(Math.round(d))} ms`
}

function Deltas({ d }: { d: EvalDeltasAgregados }) {
  const metricas = Object.entries(d.porMetrica)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard rotulo="Score médio" valor={deltaPp(d.scoreMedio)} tom={tomCard(d.scoreMedio, true)} destaque />
        <StatCard rotulo="Passaram" valor={deltaInt(d.passou)} tom={tomCard(d.passou, true)} />
        <StatCard rotulo="Falharam" valor={deltaInt(d.falhou)} tom={tomCard(d.falhou, false)} />
        <StatCard rotulo="Com erro" valor={deltaInt(d.erro)} tom={tomCard(d.erro, false)} />
        <StatCard rotulo="Custo" valor={deltaReais(d.custoCentavos)} tom={tomCard(d.custoCentavos, false)} />
        <StatCard rotulo="Tokens de entrada" valor={deltaInt(d.tokensIn)} tom={tomCard(d.tokensIn, false)} />
        <StatCard rotulo="Tokens de saída" valor={deltaInt(d.tokensOut)} tom={tomCard(d.tokensOut, false)} />
        <StatCard rotulo="Latência P50 / P95" valor={`${msDelta(d.latenciaP50Ms)} / ${msDelta(d.latenciaP95Ms)}`} tom={tomCard(d.latenciaP50Ms, false)} />
      </div>
      {metricas.length > 0 && (
        <Card>
          <h3 className="mb-2 text-base text-salvia">Por métrica</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {metricas.map(([nome, v]) => (
              <li key={nome} className="flex items-baseline justify-between gap-3">
                <span className="text-tinta">{nome}</span>
                <Badge tom={tomDelta(v, true)}>{deltaPp(v)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

const status = (s: EvalDiffCaso['statusA']) => (s ? <Badge tom={TOM_STATUS_RESULTADO[s]}>{ROTULO_STATUS_RESULTADO[s]}</Badge> : <span className="text-tinta-2">Sem resultado</span>)

const COLUNAS: ReadonlyArray<ColunaTabela<EvalDiffCaso>> = [
  {
    chave: 'caso',
    titulo: 'Caso',
    principal: true,
    render: (c) => (
      <span className="flex items-center gap-2">
        <span className="font-medium text-tinta">{c.nome}</span>
        {c.mudou && <Badge tom="atencao">Mudou</Badge>}
      </span>
    ),
  },
  { chave: 'a', titulo: 'Execução A', render: (c) => status(c.statusA) },
  { chave: 'b', titulo: 'Execução B', render: (c) => status(c.statusB) },
  {
    chave: 'delta',
    titulo: 'Delta de score',
    alinhar: 'direita',
    render: (c) => <span className="tabular">{deltaPp(c.deltaScore)}</span>,
  },
]

export function Comparacao({ a, b, aoMudar }: { a: string; b: string; aoMudar: (a: string, b: string) => void }) {
  const execs = useExecucoes({ status: 'concluida' })
  const suites = useSuites()
  const par = a !== '' && b !== '' && a !== b ? { execucaoA: a, execucaoB: b } : null
  const cmp = useComparacao(par)
  const nomeSuite = useMemo(() => new Map((suites.data ?? []).map((s) => [s.id, s.nome])), [suites.data])

  const opcoes: ReadonlyArray<SelectOption<string>> = [
    { value: '', label: 'Escolha a execução' },
    ...(execs.data ?? []).map((e) => ({ value: e.id, label: `${nomeSuite.get(e.suite_id) ?? 'Suite'}: ${rotuloExecucao(e)}` })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-2">Os deltas são sempre B menos A. Para saber se uma mudança ajudou, use a execução antiga como A e a nova como B.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-tinta">Execução A (referência)</span>
          <Select ariaLabel="Execução A" value={a} onChange={(v) => aoMudar(v, b)} options={opcoes} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-tinta">Execução B (candidata)</span>
          <Select ariaLabel="Execução B" value={b} onChange={(v) => aoMudar(a, v)} options={opcoes} />
        </div>
      </div>

      {execs.isError && <AreaErro erro={execs.error} aoTentarDeNovo={() => void execs.refetch()} />}
      {a !== '' && a === b && <p className="text-sm text-barro">Escolha duas execuções diferentes.</p>}
      {par === null && !(a !== '' && a === b) && (
        <EmptyState icone={<GitCompare className="size-7" aria-hidden />} titulo="Escolha duas execuções" descricao="A comparação aparece aqui." />
      )}
      {par !== null && cmp.isPending && <Skeleton className="h-40 w-full" />}
      {cmp.isError && <AreaErro erro={cmp.error} aoTentarDeNovo={() => void cmp.refetch()} />}
      {cmp.isSuccess && (
        <>
          <p className="text-sm text-tinta-2">
            Score médio: A {pct(cmp.data.execucaoA.resumo?.scoreMedio)} e B {pct(cmp.data.execucaoB.resumo?.scoreMedio)}. Casos avaliados: {inteiro(cmp.data.casos.length)}.
          </p>
          <Deltas d={cmp.data.deltas} />
          {cmp.data.casos.length > 0 && <TableResponsive colunas={COLUNAS} linhas={cmp.data.casos} chaveLinha={(c) => c.caso_id} legenda="Diferença por caso" />}
        </>
      )}
    </div>
  )
}
