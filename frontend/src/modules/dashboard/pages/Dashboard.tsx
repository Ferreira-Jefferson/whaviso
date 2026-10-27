// /dashboard: numeros do dia e do periodo da loja ativa (faturamento, pedidos, ticket,
// status, series por dia e hora, itens mais vendidos, saude do atendimento).
// Financeiro vem null para atendente: os tiles mostram "-". Mobile-first (390 a 1280).
import { useMemo, useState } from 'react'
import { Bot, Clock, Receipt, ShoppingBag, TrendingUp, Wallet } from 'lucide-react'
import { Card, EmptyState, GraficoBarras, PageHeader } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import { useAtendimento, useResumo, useSerieDiaria, useSerieHoraria, useTopItens } from '../api'
import { BarrasVerticais, type Coluna } from '../components/BarrasVerticais'
import { Secao } from '../components/Secao'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { Tile } from '../components/Tile'
import { diaMes, diasDoPeriodo, periodoDosUltimosDias } from '../periodo'

const OPCOES_PERIODO = [
  { dias: 1, rotulo: 'Hoje' },
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
] as const

const ROTULO_STATUS = {
  novo: 'Novos',
  em_preparo: 'Em preparo',
  saiu_entrega: 'Saiu para entrega',
  entregue: 'Entregues',
  problema: 'Com problema',
} as const

const ROTULO_ORIGEM = { whatsapp: 'WhatsApp', ifood: 'iFood', manual: 'Balcão e manual' } as const
const ROTULO_MODALIDADE = { entrega: 'Entrega', retirada: 'Retirada' } as const

const pct = (n: number) => `${Math.round(n * 100)}%`
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const dinheiro = (c: number | null | undefined) => (c == null ? null : formatarCentavos(c))

export default function Dashboard() {
  const [dias, setDias] = useState(7)
  const periodo = useMemo(() => periodoDosUltimosDias(dias), [dias])

  const resumo = useResumo(periodo)
  const diaria = useSerieDiaria(periodo)
  const horaria = useSerieHoraria(periodo)
  const top = useTopItens(periodo)
  const atend = useAtendimento(periodo)

  const r = resumo.data
  const semPedidos = resumo.isSuccess && r?.total_pedidos === 0

  const colunasDia: Coluna[] = useMemo(() => {
    const porDia = new Map((diaria.data?.dias ?? []).map((d) => [d.data, d]))
    return diasDoPeriodo(periodo).map((data) => {
      const d = porDia.get(data)
      const n = d?.pedidos ?? 0
      return {
        chave: data,
        rotulo: diaMes(data),
        valor: n,
        dica: `${diaMes(data)}: ${plural(n, 'pedido', 'pedidos')}${
          d?.faturamento_centavos != null ? `, ${formatarCentavos(d.faturamento_centavos)}` : ''
        }`,
      }
    })
  }, [diaria.data, periodo])

  const colunasHora: Coluna[] = useMemo(() => {
    const porHora = new Map((horaria.data?.horas ?? []).map((h) => [h.hora, h]))
    return Array.from({ length: 24 }, (_, hora) => {
      const n = porHora.get(hora)?.pedidos ?? 0
      return { chave: String(hora), rotulo: `${hora}h`, valor: n, dica: `${hora}h: ${plural(n, 'pedido', 'pedidos')}` }
    })
  }, [horaria.data])

  const horaPico = useMemo(() => {
    const melhor = [...colunasHora].sort((a, b) => b.valor - a.valor)[0]
    return melhor && melhor.valor > 0 ? melhor : null
  }, [colunasHora])

  const carregando = resumo.isPending

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Dashboard"
        descricao="Números do dia e do período da sua loja."
        acoes={<SeletorPeriodo dias={dias} onChange={setDias} opcoes={OPCOES_PERIODO} />}
      />

      {resumo.isError ? (
        <Secao titulo="Resumo" erro aoTentarDeNovo={() => void resumo.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile rotulo="Faturamento realizado" carregando={carregando} valor={dinheiro(r?.faturamento_realizado_centavos)} tom="folha" icone={<Wallet className="size-4" aria-hidden />} detalhe="Pedidos entregues" />
          <Tile rotulo="Em andamento" carregando={carregando} valor={dinheiro(r?.faturamento_em_andamento_centavos)} tom="ambar" icone={<TrendingUp className="size-4" aria-hidden />} detalhe="Novos, em preparo e a caminho" />
          <Tile rotulo="Pedidos" carregando={carregando} valor={r ? String(r.total_pedidos) : null} icone={<ShoppingBag className="size-4" aria-hidden />} detalhe={r ? `${r.por_status.entregue} entregues` : undefined} />
          <Tile rotulo="Ticket médio" carregando={carregando} valor={dinheiro(r?.ticket_medio_centavos)} icone={<Receipt className="size-4" aria-hidden />} detalhe={r?.tempo_medio_entrega_minutos != null ? `Entrega em ${Math.round(r.tempo_medio_entrega_minutos)} min, em média` : undefined} />
        </div>
      )}

      {semPedidos && (
        <div className="mt-4">
          <EmptyState
            icone={<ShoppingBag className="size-7" aria-hidden />}
            titulo="Nenhum pedido neste período"
            descricao="Quando os pedidos chegarem, os números aparecem aqui. Experimente um período maior."
          />
        </div>
      )}

      {!semPedidos && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Secao titulo="Pedidos por dia" carregando={diaria.isPending} erro={diaria.isError} aoTentarDeNovo={() => void diaria.refetch()}>
            <BarrasVerticais dados={colunasDia} passo={Math.max(1, Math.ceil(colunasDia.length / 6))} resumo={`Pedidos por dia, ${colunasDia.length} dias`} />
          </Secao>

          <Secao titulo="Pedidos por hora" descricao={horaPico ? `Pico às ${horaPico.rotulo}, com ${plural(horaPico.valor, 'pedido', 'pedidos')}.` : undefined} carregando={horaria.isPending} erro={horaria.isError} aoTentarDeNovo={() => void horaria.refetch()}>
            <BarrasVerticais dados={colunasHora} passo={3} resumo="Pedidos por hora do dia" cor="var(--color-dourado)" />
          </Secao>

          <Secao titulo="Situação dos pedidos" carregando={carregando} erro={resumo.isError}>
            {r && (
              <GraficoBarras
                dados={(Object.keys(ROTULO_STATUS) as Array<keyof typeof ROTULO_STATUS>).map((k) => ({ rotulo: ROTULO_STATUS[k], valor: r.por_status[k] }))}
                vazio="Sem pedidos no período."
              />
            )}
          </Secao>

          <Secao titulo="De onde vêm" carregando={carregando} erro={resumo.isError}>
            {r && (
              <div className="grid gap-5">
                <GraficoBarras
                  dados={(Object.keys(ROTULO_ORIGEM) as Array<keyof typeof ROTULO_ORIGEM>).map((k) => ({ rotulo: ROTULO_ORIGEM[k], valor: r.por_origem[k] }))}
                  cor="var(--color-revisao)"
                />
                <GraficoBarras
                  dados={(Object.keys(ROTULO_MODALIDADE) as Array<keyof typeof ROTULO_MODALIDADE>).map((k) => ({ rotulo: ROTULO_MODALIDADE[k], valor: r.por_modalidade[k] }))}
                  cor="var(--color-ambar)"
                />
              </div>
            )}
          </Secao>

          <Secao titulo="Mais vendidos" carregando={top.isPending} erro={top.isError} aoTentarDeNovo={() => void top.refetch()}>
            {top.data && top.data.itens.length === 0 ? (
              <p className="text-sm text-tinta-2">Nenhum item vendido no período.</p>
            ) : (
              <ol className="divide-y divide-linha">
                {top.data?.itens.map((it, i) => (
                  <li key={it.nome} className="flex items-center gap-3 py-2 text-sm">
                    <span className="tabular w-5 flex-none text-tinta-2">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-tinta" title={it.nome}>{it.nome}</span>
                    <span className="tabular flex-none text-tinta-2">{it.quantidade} un.</span>
                    {it.receita_centavos !== null && (
                      <span className="tabular w-24 flex-none text-right text-tinta">{formatarCentavos(it.receita_centavos)}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Secao>

          <Secao titulo="Atendimento" descricao="Quanto da conversa o atendente automático resolve sem ajuda." carregando={atend.isPending} erro={atend.isError} aoTentarDeNovo={() => void atend.refetch()}>
            {atend.data && (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Card className="!p-4">
                    <span className="flex items-center gap-1.5 text-xs text-tinta-2"><Bot className="size-3.5" aria-hidden />Autonomia</span>
                    <span className="tabular mt-1 block text-2xl text-salvia">
                      {atend.data.taxa_autonomia_ia === null ? '-' : pct(atend.data.taxa_autonomia_ia)}
                    </span>
                    <span className="text-xs text-tinta-2">
                      {atend.data.pedidos_com_conversa === 0
                        ? 'Sem pedidos com conversa'
                        : `${atend.data.pedidos_sem_intervencao_humana} de ${atend.data.pedidos_com_conversa} pedidos sem ajuda humana`}
                    </span>
                  </Card>
                  <Card className="!p-4">
                    <span className="flex items-center gap-1.5 text-xs text-tinta-2"><Clock className="size-3.5" aria-hidden />Agora</span>
                    <span className="tabular mt-1 block text-2xl text-tinta">{atend.data.conversas_abertas}</span>
                    <span className="text-xs text-tinta-2">
                      conversas abertas, {atend.data.conversas_em_humano} com a equipe
                    </span>
                  </Card>
                </div>
                <GraficoBarras
                  dados={[
                    { rotulo: 'Atendente automático', valor: atend.data.conversas_no_periodo.ia },
                    { rotulo: 'Equipe', valor: atend.data.conversas_no_periodo.humano },
                    { rotulo: 'Encerradas', valor: atend.data.conversas_no_periodo.encerrada },
                  ]}
                  vazio="Nenhuma conversa no período."
                />
              </div>
            )}
          </Secao>
        </div>
      )}
    </div>
  )
}
