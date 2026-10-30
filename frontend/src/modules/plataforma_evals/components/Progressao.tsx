// Progressao de uma suite: score medio (e hit@k, na recuperacao) ao longo das execucoes concluidas,
// para mostrar se o conhecimento e o modelo melhoram com o tempo.
import { useMemo, useState } from 'react'
import { LineChart } from 'lucide-react'
import { Card, EmptyState, Select, Skeleton, type SelectOption } from '@/shared/ui'
import { formatarData, formatarDataHora } from '@/shared/format'
import type { EvalExecucao } from '@/shared/contracts/_generated/plataforma_evals'
import { useExecucoes, useSuites } from '../api'
import { pct } from '../rotulos'
import { AreaErro } from './AreaErro'
import { GraficoSerie, type PontoSerie } from './GraficoSerie'

const MAX_PONTOS = 20
const ehHit = (k: string) => k.toLowerCase().startsWith('hit')

/** Execucoes concluidas com resumo, da mais antiga para a mais nova, limitadas as ultimas N. */
function recentes(execs: ReadonlyArray<EvalExecucao>): EvalExecucao[] {
  return execs
    .filter((e) => e.status === 'concluida' && e.resumo != null)
    .sort((a, b) => a.criada_em.localeCompare(b.criada_em))
    .slice(-MAX_PONTOS)
}

function pontos(execs: ReadonlyArray<EvalExecucao>, valor: (e: EvalExecucao) => number | null, nome: string): PontoSerie[] {
  return execs.map((e) => ({
    chave: e.id,
    rotulo: formatarData(e.criada_em).slice(0, 5),
    valor: valor(e),
    descricao: `${nome} em ${formatarDataHora(e.criada_em)}${e.modelo ? ` (${e.modelo})` : ''}: ${pct(valor(e))}`,
  }))
}

export function Progressao({ suiteInicial }: { suiteInicial: string }) {
  const suites = useSuites()
  const [escolhida, setEscolhida] = useState(suiteInicial)
  const suiteId = escolhida || suites.data?.[0]?.id || ''
  const lista = useExecucoes({ suiteId: suiteId || undefined, status: 'concluida' })
  const execs = useMemo(() => recentes(lista.data ?? []), [lista.data])
  const chaveHit = useMemo(() => execs.flatMap((e) => Object.keys(e.resumo?.porMetrica ?? {})).find(ehHit), [execs])

  const opcoes: ReadonlyArray<SelectOption<string>> = (suites.data ?? []).map((s) => ({ value: s.id, label: s.nome }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <span className="text-sm font-medium text-tinta">Suite</span>
        <Select ariaLabel="Suite da progressão" value={suiteId} onChange={setEscolhida} options={opcoes} disabled={opcoes.length === 0} />
      </div>

      {suites.isError && <AreaErro erro={suites.error} aoTentarDeNovo={() => void suites.refetch()} />}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}
      {suites.isSuccess && opcoes.length === 0 && (
        <EmptyState icone={<LineChart className="size-7" aria-hidden />} titulo="Nenhuma suite ainda" descricao="Crie uma suite e execute para acompanhar a progressão." />
      )}
      {suiteId !== '' && lista.isPending && <Skeleton className="h-48 w-full" />}
      {lista.isSuccess && execs.length === 0 && suiteId !== '' && (
        <EmptyState icone={<LineChart className="size-7" aria-hidden />} titulo="Sem execuções concluídas" descricao="Quando esta suite tiver execuções concluídas, a evolução aparece aqui." />
      )}
      {lista.isSuccess && execs.length > 0 && (
        <>
          <Card>
            <h3 className="mb-3 text-base text-salvia">Score médio por execução</h3>
            <GraficoSerie pontos={pontos(execs, (e) => e.resumo?.scoreMedio ?? null, 'Score médio')} />
          </Card>
          {chaveHit && (
            <Card>
              <h3 className="mb-3 text-base text-salvia">{`Acerto na recuperação (${chaveHit})`}</h3>
              <GraficoSerie cor="var(--color-folha)" pontos={pontos(execs, (e) => e.resumo?.porMetrica[chaveHit] ?? null, chaveHit)} />
            </Card>
          )}
          <p className="text-xs text-tinta-2">{`Últimas ${execs.length} execuções concluídas, da mais antiga para a mais recente.`}</p>
        </>
      )}
    </div>
  )
}
