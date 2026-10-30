// Central de Evals (console do operador): mede a LLM e o RAG do atendente. Abas: Suites,
// Execucoes, Comparar e Progressao. Casos de uma suite e o detalhe de uma execucao substituem as
// abas ate o usuario voltar.
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '@/shared/ui'
import type { EvalSuite } from '@/shared/contracts/_generated/plataforma_evals'
import { Comparacao } from '../components/Comparacao'
import { DetalheExecucao } from '../components/DetalheExecucao'
import { NovaExecucaoDialog } from '../components/NovaExecucaoDialog'
import { PainelCasos } from '../components/PainelCasos'
import { PainelHistorico } from '../components/PainelHistorico'
import { PainelSuites } from '../components/PainelSuites'
import { Progressao } from '../components/Progressao'

export default function Evals() {
  const [aba, setAba] = useState('suites')
  const [suiteAberta, setSuiteAberta] = useState<EvalSuite | null>(null)
  const [execAberta, setExecAberta] = useState<string | null>(null)
  const [nova, setNova] = useState<{ suiteId: string | null } | null>(null)
  const [par, setPar] = useState({ a: '', b: '' })

  const abrirExecucao = (id: string) => {
    setSuiteAberta(null)
    setExecAberta(id)
    setAba('execucoes')
  }
  const comparar = (a: string, b: string) => {
    setPar({ a, b })
    setExecAberta(null)
    setAba('comparar')
  }

  const abas: ReadonlyArray<TabItem> = [
    {
      id: 'suites',
      rotulo: 'Suites',
      conteudo: <PainelSuites aoAbrirCasos={setSuiteAberta} aoExecutar={(s) => setNova({ suiteId: s.id })} />,
    },
    { id: 'execucoes', rotulo: 'Execuções', conteudo: <PainelHistorico aoAbrir={setExecAberta} aoNova={() => setNova({ suiteId: null })} /> },
    { id: 'comparar', rotulo: 'Comparar', conteudo: <Comparacao a={par.a} b={par.b} aoMudar={(a, b) => setPar({ a, b })} /> },
    { id: 'progressao', rotulo: 'Progressão', conteudo: <Progressao suiteInicial="" /> },
  ]

  return (
    <div>
      <PageHeader titulo="Evals" descricao="Meça e compare a LLM e o RAG do atendente: crie suites, execute, acompanhe a evolução e veja se uma mudança ajudou." />
      {execAberta ? (
        <DetalheExecucao id={execAberta} aoVoltar={() => setExecAberta(null)} aoComparar={comparar} />
      ) : suiteAberta ? (
        <PainelCasos suite={suiteAberta} aoVoltar={() => setSuiteAberta(null)} aoExecutar={() => setNova({ suiteId: suiteAberta.id })} />
      ) : (
        <Tabs itens={abas} ativa={aba} aoMudar={setAba} ariaLabel="Seções da Central de Evals" />
      )}
      <NovaExecucaoDialog aberto={nova != null} aoFechar={() => setNova(null)} suiteInicial={nova?.suiteId ?? null} aoCriada={abrirExecucao} />
    </div>
  )
}
