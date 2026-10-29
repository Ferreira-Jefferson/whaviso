// Pagamentos da loja (/pagamentos): cobrancas Pix e a chave Pix. Duas secoes via SegmentedControl.
import { useState } from 'react'
import { PageHeader, SegmentedControl } from '@/shared/ui'
import { ListaPagamentos } from '../components/ListaPagamentos'
import { PixConfig } from '../components/PixConfig'
import { PagamentoConfig } from '../components/PagamentoConfig'

type Aba = 'cobrancas' | 'chave' | 'recebimento'

const ABAS = [
  { value: 'cobrancas', label: 'Cobranças' },
  { value: 'chave', label: 'Chave Pix' },
  { value: 'recebimento', label: 'Recebimento' },
] as const

export default function Pagamentos() {
  const [aba, setAba] = useState<Aba>('cobrancas')

  return (
    <div>
      <PageHeader titulo="Pagamentos" descricao="Pix dos pedidos: acompanhe as cobranças e configure o recebimento." />
      <div className="mb-4">
        <SegmentedControl ariaLabel="Seção de pagamentos" value={aba} onChange={setAba} options={ABAS} />
      </div>
      {aba === 'cobrancas' && <ListaPagamentos />}
      {aba === 'chave' && <PixConfig />}
      {aba === 'recebimento' && <PagamentoConfig />}
    </div>
  )
}
