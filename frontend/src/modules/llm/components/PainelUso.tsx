// Consumo do atendente no mes: custo estimado (centavos), tokens, por dia, por origem e por modelo.
import { TrendingUp } from 'lucide-react'
import { Banner, EmptyState, MoneyText, StatCard } from '@/shared/ui'
import type { Uso } from '../api'

const nf = new Intl.NumberFormat('pt-BR')

function diaCurto(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function PainelUso({ uso }: { uso: Uso }) {
  if (uso.total_mes_centavos === 0 && uso.por_dia.length === 0) {
    return (
      <EmptyState
        titulo="Sem consumo neste mês"
        descricao="Quando o atendente responder, o gasto estimado aparece aqui."
        icone={<TrendingUp className="size-8" strokeWidth={1.5} aria-hidden />}
      />
    )
  }
  const maximo = Math.max(1, ...uso.por_dia.map((d) => d.custo_estimado_centavos))
  return (
    <div className="flex flex-col gap-4">
      {uso.pico && (
        <Banner tom="erro">O consumo de hoje está acima do habitual. Vale conferir as conversas recentes.</Banner>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard rotulo="Gasto estimado no mês" centavos={uso.total_mes_centavos} tom="salvia" />
        <Contagem rotulo="Tokens de entrada" valor={uso.tokens_entrada_mes} />
        <Contagem rotulo="Tokens de saída" valor={uso.tokens_saida_mes} />
      </div>
      <p className="text-xs text-tinta-2">O valor é uma estimativa; a cobrança real vem do seu provedor.</p>

      {uso.por_dia.length > 0 && (
        <div className="rounded-card border border-linha bg-cartao p-4">
          <h3 className="mb-3 text-sm font-medium text-tinta">Por dia</h3>
          <ul className="flex flex-col gap-1.5">
            {uso.por_dia.map((d) => (
              <li key={d.dia} className="grid grid-cols-[3rem_1fr_5rem] items-center gap-3 text-sm">
                <span className="tabular text-tinta-2">{diaCurto(d.dia)}</span>
                <span
                  role="img"
                  aria-label={`${diaCurto(d.dia)}: ${nf.format(d.tokens_entrada + d.tokens_saida)} tokens`}
                  className="h-2.5 rounded-pill bg-papel-2"
                >
                  <span
                    className="block h-full rounded-pill bg-salvia"
                    style={{ width: `${Math.max(2, (d.custo_estimado_centavos / maximo) * 100)}%` }}
                  />
                </span>
                <MoneyText centavos={d.custo_estimado_centavos} className="text-right text-tinta" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Agregado titulo="Por origem" itens={uso.por_origem} />
        <Agregado titulo="Por modelo" itens={uso.por_modelo} />
      </div>
    </div>
  )
}

function Contagem({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-card border border-linha bg-cartao p-5">
      <span className="text-sm text-tinta-2">{rotulo}</span>
      <p className="tabular mt-2 font-display text-2xl text-tinta">{nf.format(valor)}</p>
    </div>
  )
}

function Agregado({ titulo, itens }: { titulo: string; itens: Uso['por_origem'] }) {
  return (
    <div className="rounded-card border border-linha bg-cartao p-4">
      <h3 className="mb-2 text-sm font-medium text-tinta">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="text-sm text-tinta-2">Sem dados.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-linha">
          {itens.map((i) => (
            <li key={i.rotulo} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate text-tinta">{i.rotulo}</span>
              <MoneyText centavos={i.custo_estimado_centavos} className="text-tinta-2" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
