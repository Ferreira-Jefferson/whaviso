// Resumo (relatorio) da sessao de caixa aberta: cartoes de totais, vendas por forma de
// pagamento e a lista de movimentos. So apresentacao; os numeros vem do relatorio do servidor.
import { Banknote, CreditCard, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Badge, Card, MoneyText, StatCard } from '@/shared/ui'
import { dataHoraPtBR } from '@/shared/format'
import type { CaixaRelatorioSaida } from '@/shared/contracts/_generated/caixa'
import { FORMAS_PAGAMENTO, ROTULO_FORMA, ROTULO_TIPO_MOVIMENTO } from '../estados'
import type { TipoMovimentoCaixa } from '@/shared/contracts/_generated/caixa'

interface ResumoSessaoProps {
  relatorio: CaixaRelatorioSaida
}

const TOM_BADGE_MOVIMENTO: Record<TipoMovimentoCaixa, 'sucesso' | 'atencao' | 'marca' | 'neutro'> = {
  venda: 'sucesso',
  suprimento: 'marca',
  sangria: 'atencao',
  ajuste: 'neutro',
}

export function ResumoSessao({ relatorio }: ResumoSessaoProps) {
  const { caixa, totais_por_forma } = relatorio
  // Movimentos mais recentes primeiro (apresentacao).
  const movimentos = [...relatorio.movimentos].sort(
    (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
  )

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          rotulo="Esperado em dinheiro"
          centavos={relatorio.saldo_esperado_dinheiro_centavos}
          detalhe="Saldo inicial + suprimentos + vendas em dinheiro - sangrias"
          icone={<Wallet className="size-4" strokeWidth={1.75} aria-hidden />}
          tom="salvia"
        />
        <StatCard
          rotulo="Total de vendas"
          centavos={relatorio.total_vendas_centavos}
          detalhe={`${relatorio.qtd_movimentos} movimento${relatorio.qtd_movimentos === 1 ? '' : 's'}`}
          icone={<Receipt className="size-4" strokeWidth={1.75} aria-hidden />}
          tom="folha"
        />
        <StatCard
          rotulo="Suprimentos"
          centavos={relatorio.total_suprimentos_centavos}
          icone={<TrendingUp className="size-4" strokeWidth={1.75} aria-hidden />}
          tom="neutro"
        />
        <StatCard
          rotulo="Sangrias"
          centavos={relatorio.total_sangrias_centavos}
          icone={<TrendingDown className="size-4" strokeWidth={1.75} aria-hidden />}
          tom="ambar"
        />
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="size-4 text-tinta-2" strokeWidth={1.75} aria-hidden />
          <h3 className="font-display text-base font-semibold text-tinta">Vendas por forma</h3>
        </div>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {FORMAS_PAGAMENTO.map((forma) => (
            <div
              key={forma}
              className="flex items-center justify-between gap-2 rounded-input border border-linha bg-papel-2 px-3 py-2"
            >
              <dt className="text-sm text-tinta-2">{ROTULO_FORMA[forma]}</dt>
              <dd>
                <MoneyText centavos={totais_por_forma[forma]} className="text-sm font-medium text-tinta" />
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Banknote className="size-4 text-tinta-2" strokeWidth={1.75} aria-hidden />
          <h3 className="font-display text-base font-semibold text-tinta">Movimentos</h3>
          <Badge tom="neutro">{movimentos.length}</Badge>
        </div>

        {movimentos.length === 0 ? (
          <p className="text-sm text-tinta-2">Nenhum movimento registrado ainda nesta sessão.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-linha">
            {movimentos.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge tom={TOM_BADGE_MOVIMENTO[m.tipo]}>{ROTULO_TIPO_MOVIMENTO[m.tipo]}</Badge>
                    {m.forma_pagamento && (
                      <span className="text-xs text-tinta-2">{ROTULO_FORMA[m.forma_pagamento]}</span>
                    )}
                  </div>
                  {m.motivo && <span className="truncate text-sm text-tinta-2">{m.motivo}</span>}
                  <span className="text-xs text-tinta-2">{dataHoraPtBR(m.criado_em)}</span>
                </div>
                <MoneyText centavos={m.valor_centavos} className="shrink-0 text-sm font-medium text-tinta" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-tinta-2">Caixa aberto em {dataHoraPtBR(caixa.aberto_em)}.</p>
    </div>
  )
}
