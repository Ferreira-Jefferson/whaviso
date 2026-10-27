// /relatorios: BI de fundo da loja (vendas por dimensao, formas de pagamento, problemas e
// coortes). Cada aba so busca quando aberta. Exige `relatorios:ver` (dono/gerente).
import { useMemo, useState } from 'react'
import { PageHeader, SegmentedControl } from '@/shared/ui'
import { SecaoCancelamentos } from '../components/SecaoCancelamentos'
import { SecaoCoortes } from '../components/SecaoCoortes'
import { SecaoPagamentos } from '../components/SecaoPagamentos'
import { SecaoVendas } from '../components/SecaoVendas'
import { SeletorPeriodo } from '../components/SeletorPeriodo'
import { periodoDosUltimosDias } from '../periodo'

type Aba = 'vendas' | 'pagamentos' | 'problemas' | 'coortes'

const ABAS: ReadonlyArray<{ value: Aba; label: string }> = [
  { value: 'vendas', label: 'Vendas' },
  { value: 'pagamentos', label: 'Pagamentos' },
  { value: 'problemas', label: 'Problemas' },
  { value: 'coortes', label: 'Retenção' },
]

const OPCOES_PERIODO = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '12 meses' },
] as const

export default function Relatorios() {
  const [aba, setAba] = useState<Aba>('vendas')
  const [dias, setDias] = useState(30)
  const periodo = useMemo(() => periodoDosUltimosDias(dias), [dias])

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Relatórios"
        descricao="Vendas, pagamentos, problemas e retenção de clientes."
        acoes={<SeletorPeriodo dias={dias} onChange={setDias} opcoes={OPCOES_PERIODO} />}
      />
      <div className="mb-4 sm:max-w-xl">
        <SegmentedControl ariaLabel="Relatório" value={aba} onChange={setAba} options={ABAS} preencher />
      </div>
      {aba === 'vendas' && <SecaoVendas periodo={periodo} />}
      {aba === 'pagamentos' && <SecaoPagamentos periodo={periodo} />}
      {aba === 'problemas' && <SecaoCancelamentos periodo={periodo} />}
      {aba === 'coortes' && <SecaoCoortes periodo={periodo} />}
    </div>
  )
}
