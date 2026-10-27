// /custos: painel de custos externos da loja (IA, WhatsApp, mapas, fiscal) para dar
// consciencia de gasto: total, media por dia, dia de pico, por categoria, por dia e eventos.
// Periodo maximo de 92 dias (limite da api). Mobile-first (390 a 1280).
import { useMemo, useState } from 'react'
import { CalendarDays, Flame, Wallet } from 'lucide-react'
import { Card, EmptyState, PageHeader } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import { useResumoCustos } from '../api'
import { BarrasVerticais, type Coluna } from '../components/BarrasVerticais'
import { EventosCusto } from '../components/EventosCusto'
import { Secao } from '../components/Secao'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { Tile } from '../components/Tile'
import { diaMes, diasDoPeriodo, periodoDosUltimosDias } from '../periodo'
import { COR_CATEGORIA, ROTULO_CATEGORIA } from '../rotulos'

const OPCOES_PERIODO = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
] as const

export default function Custos() {
  const [dias, setDias] = useState(30)
  const periodo = useMemo(() => periodoDosUltimosDias(dias), [dias])
  const q = useResumoCustos(periodo)
  const r = q.data

  const colunas: Coluna[] = useMemo(() => {
    const porDia = new Map((r?.por_dia ?? []).map((d) => [d.dia, d.total_centavos]))
    const pico = r?.pico_dia?.dia
    return diasDoPeriodo(periodo).map((dia) => {
      const v = porDia.get(dia) ?? 0
      return { chave: dia, rotulo: diaMes(dia), valor: v, dica: `${diaMes(dia)}: ${formatarCentavos(v)}`, destaque: pico ? dia === pico : undefined }
    })
  }, [r, periodo])

  const semCusto = q.isSuccess && r?.total_centavos === 0
  const categorias = useMemo(
    () => [...(r?.por_categoria ?? [])].sort((a, b) => b.total_centavos - a.total_centavos),
    [r],
  )
  const maxCategoria = Math.max(1, ...categorias.map((c) => c.total_centavos))

  const resumoGrafico = r
    ? `Custo por dia nos últimos ${dias} dias. Total ${formatarCentavos(r.total_centavos)}.` +
      (r.pico_dia ? ` Maior custo em ${diaMes(r.pico_dia.dia)}: ${formatarCentavos(r.pico_dia.total_centavos)}.` : '')
    : `Custo por dia, ${colunas.length} dias`

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Custos"
        descricao="Quanto os serviços externos custaram para a sua loja."
        acoes={<SeletorPeriodo dias={dias} onChange={setDias} opcoes={OPCOES_PERIODO} />}
      />

      {q.isError ? (
        <Secao titulo="Resumo" erro aoTentarDeNovo={() => void q.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Tile rotulo="Total no período" carregando={q.isPending} valor={r ? formatarCentavos(r.total_centavos) : null} tom="ambar" icone={<Wallet className="size-4" aria-hidden />} detalhe={r ? `${diaMes(r.de)} a ${diaMes(r.ate)}` : undefined} />
          <Tile rotulo="Média por dia" carregando={q.isPending} valor={r ? formatarCentavos(r.media_dia_centavos) : null} icone={<CalendarDays className="size-4" aria-hidden />} />
          <Tile rotulo="Dia de maior custo" carregando={q.isPending} valor={r ? (r.pico_dia ? formatarCentavos(r.pico_dia.total_centavos) : '-') : null} icone={<Flame className="size-4" aria-hidden />} detalhe={r?.pico_dia ? `Em ${diaMes(r.pico_dia.dia)}` : 'Sem custo no período'} />
        </div>
      )}

      {semCusto && (
        <div className="mt-4">
          <EmptyState icone={<Wallet className="size-7" aria-hidden />} titulo="Sem custos neste período" descricao="Quando a loja usar IA, mensagens de WhatsApp, mapas ou emissão fiscal, o gasto aparece aqui." />
        </div>
      )}

      {!semCusto && !q.isError && (
        <div className="mt-4 flex flex-col gap-4">
          <Secao titulo="Custo por dia" descricao={r?.pico_dia ? 'O dia de maior custo fica em destaque.' : undefined} carregando={q.isPending}>
            <BarrasVerticais
              dados={colunas}
              passo={Math.max(1, Math.ceil(colunas.length / 6))}
              resumo={resumoGrafico}
              cor="var(--color-ambar)"
              corDestaque="var(--color-dourado)"
              rotuloMax={r?.pico_dia ? formatarCentavos(r.pico_dia.total_centavos) : undefined}
            />
          </Secao>

          <div className="grid gap-4 lg:grid-cols-2">
          <Secao titulo="Por categoria" carregando={q.isPending}>
            <ul className="flex flex-col gap-3">
              {categorias.map((c) => {
                const p = r && r.total_centavos > 0 ? Math.round((c.total_centavos / r.total_centavos) * 100) : 0
                return (
                  <li key={c.categoria}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className="text-tinta">{ROTULO_CATEGORIA[c.categoria]}</span>
                      <span className="tabular text-tinta-2">{formatarCentavos(c.total_centavos)} · {p}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-pill bg-papel-2" role="img" aria-label={`${ROTULO_CATEGORIA[c.categoria]}: ${formatarCentavos(c.total_centavos)} (${p}%)`}>
                      <div className="h-full rounded-pill" style={{ width: `${Math.round((c.total_centavos / maxCategoria) * 100)}%`, backgroundColor: COR_CATEGORIA[c.categoria] }} />
                    </div>
                    <span className="mt-1 block text-xs text-tinta-2">{c.eventos.toLocaleString('pt-BR')} {c.eventos === 1 ? 'evento' : 'eventos'}</span>
                  </li>
                )
              })}
            </ul>
          </Secao>

          <Secao titulo="Por origem" descricao="De qual parte do sistema veio o gasto." carregando={q.isPending}>
            <ul className="divide-y divide-linha">
              {r?.por_origem.map((o) => (
                <li key={o.origem} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-tinta" title={o.origem}>{o.origem}</span>
                  <span className="tabular flex-none text-tinta">{formatarCentavos(o.total_centavos)}</span>
                </li>
              ))}
            </ul>
          </Secao>
          </div>

          <Card>
            <h2 className="text-lg text-salvia">Eventos</h2>
            <p className="mt-0.5 text-xs text-tinta-2">Cada cobrança registrada, sem conteúdo de conversa.</p>
            <div className="mt-4"><EventosCusto periodo={periodo} /></div>
          </Card>
        </div>
      )}
    </div>
  )
}
