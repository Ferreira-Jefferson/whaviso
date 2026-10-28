// Montador de relatorio de vendas: o usuario escolhe a dimensao de agrupamento e combina
// filtros, com as dimensoes (inclusive os grupos de opcao do cardapio) vindas do servidor.
// Tudo no grao de item (faturamento = receita dos itens). O salao (mesas) e uma visao a parte.
import { useMemo, useState } from 'react'
import { Download, Receipt, ShoppingBag, Utensils, Wallet, X } from 'lucide-react'
import { Button, Card, EmptyState, MeterBar, SectionHeader, Select, Skeleton, TableResponsive, type ColunaTabela, type SelectOption } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import type { DimensoesSaida, VendasSaida } from '@/shared/contracts/_generated/relatorios'
import { useDimensoes, useSalao, useVendas, type FiltroVendas } from '../api'
import type { Periodo } from '../periodo'
import { ErroRelatorio } from './ErroRelatorio'
import { Tile } from './Tile'

type Dimensao = DimensoesSaida['dimensoes'][number]
type Linha = VendasSaida['linhas'][number]

const pct = (n: number | null) => (n === null ? '-' : `${Math.round(n * 100)}%`)

// --- Export CSV (abre no Excel; ';' e BOM para o pt-BR) -----------------------
const csvCampo = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
const reais = (cent: number) => (cent / 100).toFixed(2).replace('.', ',')

function baixarCsv(nomeDim: string, d: VendasSaida, periodo: Periodo) {
  const cabec = [nomeDim, 'Pedidos', 'Unidades', 'Faturamento', 'Participação %']
  const linhas = d.linhas.map((l) => [
    l.rotulo, l.pedidos, l.quantidade, reais(l.faturamento_centavos),
    l.participacao === null ? '' : Math.round(l.participacao * 100),
  ])
  const corpo = [cabec, ...linhas].map((cols) => cols.map(csvCampo).join(';')).join('\r\n')
  const blob = new Blob([`﻿${corpo}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `vendas_${nomeDim.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${periodo.de}_a_${periodo.ate}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Uma linha de filtro: escolhe valores de uma dimensao (chips removiveis). */
function FiltroLinha({ dim, filtro, aoMudar, aoRemover }: {
  dim: Dimensao
  filtro: FiltroVendas
  aoMudar: (valores: string[]) => void
  aoRemover: () => void
}) {
  const [texto, setTexto] = useState('')
  const rotuloValor = (chave: string) => dim.valores?.find((v) => v.chave === chave)?.rotulo ?? chave
  const disponiveis: SelectOption<string>[] = (dim.valores ?? [])
    .filter((v) => !filtro.valores.includes(v.chave))
    .map((v) => ({ value: v.chave, label: v.rotulo }))

  return (
    <div className="grid gap-2 rounded-lg border border-linha bg-cartao p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{dim.rotulo}</span>
        <button type="button" onClick={aoRemover} className="text-tinta-2 hover:text-tinta" aria-label={`Remover filtro ${dim.rotulo}`}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {filtro.valores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filtro.valores.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => aoMudar(filtro.valores.filter((x) => x !== v))}
              className="inline-flex items-center gap-1 rounded-full border border-linha px-2 py-0.5 text-xs hover:bg-linha/40"
            >
              {rotuloValor(v)}
              <X className="size-3" aria-hidden />
            </button>
          ))}
        </div>
      )}
      {dim.valores === null ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const t = texto.trim()
            if (t && !filtro.valores.includes(t)) aoMudar([...filtro.valores, t])
            setTexto('')
          }}
        >
          <input
            name={`filtro-${dim.chave}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`Digite um valor de ${dim.rotulo.toLowerCase()}`}
            aria-label={`Valor de ${dim.rotulo}`}
            className="h-9 flex-1 rounded-md border border-linha bg-fundo px-3 text-sm"
          />
          <Button type="submit" variante="secondary">Adicionar</Button>
        </form>
      ) : disponiveis.length > 0 ? (
        <Select
          ariaLabel={`Adicionar valor de ${dim.rotulo}`}
          value=""
          onChange={(v) => v && aoMudar([...filtro.valores, v])}
          options={[{ value: '', label: 'Adicionar valor...' }, ...disponiveis]}
        />
      ) : null}
    </div>
  )
}

export function SecaoVendas({ periodo }: { periodo: Periodo }) {
  const dimsQ = useDimensoes()
  const dims = useMemo(() => dimsQ.data?.dimensoes ?? [], [dimsQ.data])
  const porChave = useMemo(() => new Map(dims.map((d) => [d.chave, d])), [dims])

  const [agruparPor, setAgruparPor] = useState('item')
  const [filtros, setFiltros] = useState<FiltroVendas[]>([])

  // Agrupamento valido mesmo se o catalogo ainda carrega ou a dimensao sumiu do cardapio.
  const agrupamento = porChave.has(agruparPor) || dims.length === 0 ? agruparPor : 'item'
  const q = useVendas(periodo, { agrupar_por: agrupamento, filtros: filtros.filter((f) => f.valores.length > 0) })
  const d = q.data

  const opcoesAgrupar: SelectOption<string>[] = dims.map((dim) => ({
    value: dim.chave,
    label: dim.grupo === 'opcao' ? `Opção: ${dim.rotulo}` : dim.rotulo,
  }))
  const dimAtual = porChave.get(agrupamento)
  const colunaRotulo = dimAtual?.rotulo ?? 'Grupo'

  const filtraveis = dims.filter((dim) => dim.filtravel && !filtros.some((f) => f.dimensao === dim.chave))

  const colunas: ColunaTabela<Linha>[] = [
    { chave: 'rotulo', titulo: colunaRotulo, principal: true, render: (l) => <span className="font-medium">{l.rotulo}</span> },
    { chave: 'pedidos', titulo: 'Pedidos', alinhar: 'direita', render: (l) => <span className="tabular">{l.pedidos}</span> },
    { chave: 'quantidade', titulo: 'Unidades', alinhar: 'direita', render: (l) => <span className="tabular">{l.quantidade}</span> },
    { chave: 'faturamento', titulo: 'Faturamento', alinhar: 'direita', render: (l) => <span className="tabular">{formatarCentavos(l.faturamento_centavos)}</span> },
    { chave: 'ticket', titulo: 'Ticket médio', alinhar: 'direita', render: (l) => <span className="tabular">{l.ticket_medio_centavos === null ? '-' : formatarCentavos(l.ticket_medio_centavos)}</span> },
    {
      chave: 'participacao',
      titulo: 'Participação',
      alinhar: 'direita',
      render: (l) => (
        <span className="inline-flex items-center justify-end gap-2">
          <MeterBar valor={(l.participacao ?? 0) * 100} className="w-16" />
          <span className="tabular w-10 text-right">{pct(l.participacao)}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-xl border border-linha bg-cartao/60 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-tinta-2">Agrupar por</span>
            <Select className="w-full sm:w-72" ariaLabel="Agrupar vendas por" value={agrupamento} onChange={setAgruparPor} options={opcoesAgrupar.length ? opcoesAgrupar : [{ value: 'item', label: 'Item' }]} />
          </label>
          <div className="ml-auto">
            <Button variante="secondary" onClick={() => d && baixarCsv(colunaRotulo, d, periodo)} disabled={!d || d.linhas.length === 0}>
              <Download className="size-4" aria-hidden /> Exportar CSV
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          {filtros.map((f) => {
            const dim = porChave.get(f.dimensao)
            if (!dim) return null
            return (
              <FiltroLinha
                key={f.dimensao}
                dim={dim}
                filtro={f}
                aoMudar={(valores) => setFiltros((atual) => atual.map((x) => (x.dimensao === f.dimensao ? { ...x, valores } : x)))}
                aoRemover={() => setFiltros((atual) => atual.filter((x) => x.dimensao !== f.dimensao))}
              />
            )
          })}
          {filtraveis.length > 0 && (
            <Select
              className="w-full sm:w-72"
              ariaLabel="Adicionar filtro"
              value=""
              onChange={(chave) => chave && setFiltros((atual) => [...atual, { dimensao: chave, valores: [] }])}
              options={[
                { value: '', label: '+ Adicionar filtro' },
                ...filtraveis.map((dim) => ({ value: dim.chave, label: dim.grupo === 'opcao' ? `Opção: ${dim.rotulo}` : dim.rotulo })),
              ]}
            />
          )}
        </div>
      </div>

      {q.isError ? (
        <ErroRelatorio erro={q.error} aoTentarDeNovo={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Tile rotulo="Faturamento" carregando={q.isPending} valor={d ? formatarCentavos(d.total_faturamento_centavos) : null} tom="folha" icone={<Wallet className="size-4" aria-hidden />} detalhe="Receita dos itens" />
            <Tile rotulo="Pedidos" carregando={q.isPending} valor={d ? String(d.total_pedidos) : null} icone={<ShoppingBag className="size-4" aria-hidden />} />
            <Tile rotulo="Ticket médio" carregando={q.isPending} valor={d ? (d.total_pedidos > 0 ? formatarCentavos(Math.round(d.total_faturamento_centavos / d.total_pedidos)) : '-') : null} icone={<Receipt className="size-4" aria-hidden />} />
          </div>
          <div className="grid gap-3">
            <SectionHeader
              titulo="Resultado"
              meta={d && d.linhas.length > 0 ? `${d.linhas.length} ${d.linhas.length === 1 ? 'linha' : 'linhas'}` : undefined}
            />
            <Card className="border-0 bg-transparent !p-0 md:border md:border-linha md:bg-cartao md:!p-4">
              {q.isPending ? (
                <div className="grid gap-2.5 p-3" aria-busy="true" aria-label="Carregando vendas">
                  {['w-full', 'w-11/12', 'w-10/12', 'w-9/12', 'w-10/12', 'w-8/12'].map((w, i) => (
                    <Skeleton key={i} className={`h-5 ${w}`} />
                  ))}
                </div>
              ) : d && d.linhas.length === 0 ? (
                <EmptyState icone={<ShoppingBag className="size-7" aria-hidden />} titulo="Sem vendas no período" descricao="Só pedidos entregues entram aqui. Ajuste o período ou os filtros." />
              ) : (
                d && <TableResponsive legenda="Vendas" colunas={colunas} linhas={d.linhas} chaveLinha={(l) => l.chave} />
              )}
            </Card>
          </div>
        </>
      )}

      <SecaoSalao periodo={periodo} />
    </div>
  )
}

/** Vendas do salao por mesa (comandas fechadas). So aparece quando a loja usa o salao. */
function SecaoSalao({ periodo }: { periodo: Periodo }) {
  const q = useSalao(periodo)
  const d = q.data
  if (!d || d.linhas.length === 0) return null
  type L = VendasSaida['linhas'][number]
  const colunas: ColunaTabela<L>[] = [
    { chave: 'rotulo', titulo: 'Mesa', principal: true, render: (l) => <span className="font-medium">{l.rotulo}</span> },
    { chave: 'pedidos', titulo: 'Comandas', alinhar: 'direita', render: (l) => <span className="tabular">{l.pedidos}</span> },
    { chave: 'faturamento', titulo: 'Faturamento', alinhar: 'direita', render: (l) => <span className="tabular">{formatarCentavos(l.faturamento_centavos)}</span> },
    { chave: 'ticket', titulo: 'Ticket médio', alinhar: 'direita', render: (l) => <span className="tabular">{l.ticket_medio_centavos === null ? '-' : formatarCentavos(l.ticket_medio_centavos)}</span> },
  ]
  return (
    <div className="grid gap-3">
      <SectionHeader titulo="Salão (mesas)" meta={`Faturamento ${formatarCentavos(d.total_faturamento_centavos)}`} />
      <Card className="border-0 bg-transparent !p-0 md:border md:border-linha md:bg-cartao md:!p-4">
        <div className="mb-2 flex items-center gap-2 px-1 text-xs text-tinta-2">
          <Utensils className="size-3.5" aria-hidden /> Comandas fechadas do salão, fora do montador de pedidos.
        </div>
        <TableResponsive legenda="Vendas por mesa" colunas={colunas} linhas={d.linhas} chaveLinha={(l) => l.chave} />
      </Card>
    </div>
  )
}
