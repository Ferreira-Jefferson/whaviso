// Painel de crescimento da plataforma (operador Whaviso): MRR, base ativa, churn, inadimplencia e
// conversao. So agregados: nunca conteudo nem volume de uso de loja. Numeros do servidor
// (cache de 60 s); `calculado_em` mostra a idade do dado.
import { useState } from 'react'
import {
  Banknote,
  BarChart3,
  Clock,
  Filter,
  Hourglass,
  Receipt,
  Store,
  Target,
  TrendingDown,
  UserMinus,
  UserPlus,
  Wallet,
} from 'lucide-react'
import {
  Banner,
  Card,
  MoneyText,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  cn,
  type ColunaTabela,
} from '@/shared/ui'
import { brl, formatarDataHora, formatarHora } from '@/shared/format'
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
    <div className="animate-rise">
      <PageHeader
        titulo="Crescimento"
        descricao={r ? `Base de clientes em ${mesLongo(r.mes)}.` : 'Base de clientes da Whaviso.'}
        acoes={
          r ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-pill bg-papel-2 px-2.5 py-1 text-xs font-medium text-tinta-2"
              title={`Atualizado em ${formatarDataHora(r.calculado_em)}`}
            >
              <Clock className="size-3.5" aria-hidden />
              Atualizado às {formatarHora(r.calculado_em)}
            </span>
          ) : undefined
        }
      />

      {resumo.isError ? (
        <AreaErro erro={resumo.error} aoTentarDeNovo={() => void resumo.refetch()} />
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="sec-indicadores" className="flex flex-col gap-3">
            <h2 id="sec-indicadores" className="text-lg text-salvia">Indicadores do mês</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi rotulo="MRR" tom="salvia" destaque icone={<Wallet className="size-4" aria-hidden />} carregando={resumo.isPending} valor={r && brl(r.mrr_centavos)} detalhe="Assinaturas ativas (trial e suspensas ficam de fora)" />
              <Kpi rotulo="Ticket médio (ARPA)" icone={<Receipt className="size-4" aria-hidden />} carregando={resumo.isPending} valor={r && (r.arpa_centavos === null ? 'Sem base' : brl(r.arpa_centavos))} detalhe="MRR por conta ativa" />
              <Kpi rotulo="Lojas ativas" tom="folha" icone={<Store className="size-4" aria-hidden />} carregando={resumo.isPending} valor={r?.lojas_ativas} detalhe={r ? `${r.contas_ativas} contas ativas` : undefined} />
              <Kpi rotulo="Novas contas no mês" icone={<UserPlus className="size-4" aria-hidden />} carregando={resumo.isPending} valor={r?.novas_contas_mes} />
              <Kpi rotulo="Churn de contas" tom="ambar" icone={<UserMinus className="size-4" aria-hidden />} carregando={resumo.isPending} valor={r && percentual(r.churn_contas)} detalhe="Cancelamentos do mês sobre a base inicial" />
              <Kpi rotulo="Churn de MRR" tom="ambar" icone={<TrendingDown className="size-4" aria-hidden />} carregando={resumo.isPending} valor={r && percentual(r.churn_mrr)} detalhe="Mesma conta, em valor" />
              <Kpi rotulo="Conversão do funil" icone={<Filter className="size-4" aria-hidden />} carregando={resumo.isPending} valor={r && percentual(r.conversao_funil)} detalhe="Prospectos do mês que viraram clientes" />
              <Kpi rotulo="Conversão do trial" icone={<Target className="size-4" aria-hidden />} carregando={resumo.isPending} valor={r && percentual(r.conversao_trial)} detalhe="Trials do mês que começaram a pagar" />
            </div>
          </section>

          <section aria-labelledby="sec-receita" className="flex flex-col gap-3">
            <h2 id="sec-receita" className="text-lg text-salvia">Receita e inadimplência</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Kpi rotulo="Receita realizada no mês" tom="folha" icone={<Banknote className="size-4" aria-hidden />} carregando={resumo.isPending} valor={r && brl(r.receita_realizada_centavos)} detalhe="Faturas baixadas como pagas no mês" />
              <Kpi
                rotulo="Inadimplência"
                tom={r && r.inadimplencia.valor_centavos > 0 ? 'barro' : 'neutro'}
                icone={<Hourglass className="size-4" aria-hidden />}
                carregando={resumo.isPending}
                valor={r && brl(r.inadimplencia.valor_centavos)}
                detalhe={r ? `${r.inadimplencia.contas} ${r.inadimplencia.contas === 1 ? 'conta' : 'contas'} com fatura atrasada` : undefined}
              />
              <Card className="flex flex-col gap-3">
                <h3 className="text-sm text-tinta-2">Assinaturas por situação</h3>
                {resumo.isPending || !r ? (
                  <Skeleton className="h-20 w-full" />
                ) : (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                    {(
                      [
                        ['Ativas', r.assinaturas.ativa, 'bg-folha'],
                        ['Em trial', r.assinaturas.trial, 'bg-salvia'],
                        ['Suspensas', r.assinaturas.suspensa, 'bg-ambar'],
                        ['Canceladas', r.assinaturas.cancelada, 'bg-cinza-expirado'],
                      ] as const
                    ).map(([rotulo, n, ponto]) => (
                      <div key={rotulo} className="flex items-baseline justify-between gap-2">
                        <dt className="flex items-center gap-1.5 text-tinta-2">
                          <span className={cn('size-2 flex-none rounded-full', ponto)} aria-hidden />
                          {rotulo}
                        </dt>
                        <dd className="tabular font-semibold text-tinta">{n}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Card>
            </div>
          </section>

          <section aria-labelledby="sec-serie" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="sec-serie" className="flex items-center gap-2 text-lg text-salvia">
                <BarChart3 className="size-5 text-tinta-2" aria-hidden />
                Evolução mensal
              </h2>
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
                  <div className="mb-4 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm text-tinta-2">MRR por mês</h3>
                    {(() => {
                      const atual = serie.data.meses[serie.data.meses.length - 1]
                      return atual ? (
                        <span className="text-xs text-tinta-2">
                          Atual <span className="tabular text-salvia">{brl(atual.mrr_centavos)}</span>
                        </span>
                      ) : null
                    })()}
                  </div>
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
