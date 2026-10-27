// Painel de crescimento da plataforma (operador Whaviso): MRR, base ativa, churn, inadimplencia e
// conversao. So agregados: nunca conteudo nem volume de uso de loja. Numeros do servidor
// (cache de 60 s); `calculado_em` mostra a idade do dado.
import { useState } from 'react'
import {
  Banner,
  Card,
  MoneyText,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { brl, formatarDataHora } from '@/shared/format'
import type { PainelSerieMes } from '@/shared/contracts/_generated/plataforma_painel'
import { usePainelResumo, usePainelSerie } from '../api'
import { mesCurto, mesLongo, percentual } from '../formato'
import { AreaErro } from '../components/AreaErro'
import { GraficoSerie } from '../components/GraficoSerie'
import { Kpi } from '../components/Kpi'

const PERIODOS = [
  { value: '6', label: '6 meses' },
  { value: '12', label: '12 meses' },
  { value: '24', label: '24 meses' },
] as const

const COLUNAS: ReadonlyArray<ColunaTabela<PainelSerieMes>> = [
  { chave: 'mes', titulo: 'Mês', principal: true, render: (m) => <span className="font-medium">{mesLongo(m.mes)}</span> },
  { chave: 'mrr', titulo: 'MRR', alinhar: 'direita', render: (m) => <MoneyText centavos={m.mrr_centavos} /> },
  { chave: 'ativas', titulo: 'Assinaturas ativas', alinhar: 'direita', render: (m) => <span className="tabular">{m.assinaturas_ativas}</span> },
  { chave: 'novas', titulo: 'Novas contas', alinhar: 'direita', render: (m) => <span className="tabular">{m.novas_contas}</span> },
  { chave: 'cancel', titulo: 'Cancelamentos', alinhar: 'direita', render: (m) => <span className="tabular">{m.cancelamentos}</span> },
  { chave: 'churn', titulo: 'Churn', alinhar: 'direita', render: (m) => <span className="tabular">{percentual(m.churn_contas)}</span> },
  { chave: 'receita', titulo: 'Receita realizada', alinhar: 'direita', render: (m) => <MoneyText centavos={m.receita_realizada_centavos} /> },
]

export default function Painel() {
  const [meses, setMeses] = useState('12')
  const resumo = usePainelResumo()
  const serie = usePainelSerie(Number(meses))
  const r = resumo.data

  return (
    <div>
      <PageHeader
        titulo="Crescimento"
        descricao={
          r
            ? `Base de clientes em ${mesLongo(r.mes)}. Atualizado em ${formatarDataHora(r.calculado_em)}.`
            : 'Base de clientes da Whaviso.'
        }
      />

      {resumo.isError ? (
        <AreaErro erro={resumo.error} aoTentarDeNovo={() => void resumo.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-label="Indicadores do mês" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi rotulo="MRR" tom="salvia" carregando={resumo.isPending} valor={r && brl(r.mrr_centavos)} detalhe="Assinaturas ativas (trial e suspensas ficam de fora)" />
            <Kpi rotulo="Ticket médio (ARPA)" carregando={resumo.isPending} valor={r && (r.arpa_centavos === null ? 'Sem base' : brl(r.arpa_centavos))} detalhe="MRR por conta ativa" />
            <Kpi rotulo="Lojas ativas" tom="folha" carregando={resumo.isPending} valor={r?.lojas_ativas} detalhe={r ? `${r.contas_ativas} contas ativas` : undefined} />
            <Kpi rotulo="Novas contas no mês" carregando={resumo.isPending} valor={r?.novas_contas_mes} />
            <Kpi rotulo="Churn de contas" tom="ambar" carregando={resumo.isPending} valor={r && percentual(r.churn_contas)} detalhe="Cancelamentos do mês sobre a base inicial" />
            <Kpi rotulo="Churn de MRR" tom="ambar" carregando={resumo.isPending} valor={r && percentual(r.churn_mrr)} detalhe="Mesma conta, em valor" />
            <Kpi rotulo="Conversão do funil" carregando={resumo.isPending} valor={r && percentual(r.conversao_funil)} detalhe="Prospectos do mês que viraram clientes" />
            <Kpi rotulo="Conversão do trial" carregando={resumo.isPending} valor={r && percentual(r.conversao_trial)} detalhe="Trials do mês que começaram a pagar" />
          </section>

          <section aria-label="Receita e inadimplência" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Kpi rotulo="Receita realizada no mês" tom="folha" carregando={resumo.isPending} valor={r && brl(r.receita_realizada_centavos)} detalhe="Faturas baixadas como pagas no mês" />
            <Kpi
              rotulo="Inadimplência"
              tom={r && r.inadimplencia.valor_centavos > 0 ? 'barro' : 'neutro'}
              carregando={resumo.isPending}
              valor={r && brl(r.inadimplencia.valor_centavos)}
              detalhe={r ? `${r.inadimplencia.contas} ${r.inadimplencia.contas === 1 ? 'conta' : 'contas'} com fatura atrasada` : undefined}
            />
            <Card>
              <h2 className="text-sm text-tinta-2">Assinaturas por situação</h2>
              {resumo.isPending || !r ? (
                <Skeleton className="mt-3 h-16 w-full" />
              ) : (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {(
                    [
                      ['Ativas', r.assinaturas.ativa],
                      ['Em trial', r.assinaturas.trial],
                      ['Suspensas', r.assinaturas.suspensa],
                      ['Canceladas', r.assinaturas.cancelada],
                    ] as const
                  ).map(([rotulo, n]) => (
                    <div key={rotulo} className="flex items-baseline justify-between gap-2">
                      <dt className="text-tinta-2">{rotulo}</dt>
                      <dd className="tabular font-semibold">{n}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          </section>

          <section aria-label="Série mensal" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl text-salvia">Evolução mensal</h2>
              <SegmentedControl ariaLabel="Período da série" value={meses} onChange={setMeses} options={PERIODOS} />
            </div>

            {serie.isError && <AreaErro erro={serie.error} aoTentarDeNovo={() => void serie.refetch()} />}
            {serie.isPending && <Skeleton className="h-56 w-full" />}
            {serie.data && (
              <>
                {serie.data.mrr_aproximado && (
                  <Banner tom="info">
                    O MRR dos meses anteriores usa o valor atual de cada assinatura (ainda não há histórico de
                    reajuste), então é uma aproximação.
                  </Banner>
                )}
                <Card>
                  <h3 className="mb-3 text-sm text-tinta-2">MRR por mês</h3>
                  <GraficoSerie
                    pontos={serie.data.meses.map((m) => ({
                      rotulo: mesCurto(m.mes),
                      valor: m.mrr_centavos,
                      descricao: `${mesLongo(m.mes)}: MRR de ${brl(m.mrr_centavos)}`,
                    }))}
                  />
                </Card>
                <TableResponsive
                  colunas={COLUNAS}
                  linhas={[...serie.data.meses].reverse()}
                  chaveLinha={(m) => m.mes}
                  legenda="Série mensal de crescimento"
                />
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
