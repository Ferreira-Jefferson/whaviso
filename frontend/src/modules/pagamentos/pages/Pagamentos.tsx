// Pagamentos da loja (/pagamentos): cobrancas Pix e a chave Pix. Duas secoes via SegmentedControl.
import { useState } from 'react'
import { PageHeader, SegmentedControl } from '@/shared/ui'
import { ListaPagamentos } from '../components/ListaPagamentos'
import { PixConfig } from '../components/PixConfig'

type Aba = 'cobrancas' | 'chave'

const ABAS = [
  { value: 'cobrancas', label: 'Cobranças' },
  { value: 'chave', label: 'Chave Pix' },
] as const

export default function Pagamentos() {
  const [aba, setAba] = useState<Aba>('cobrancas')

  return (
    <div>
      <PageHeader titulo="Pagamentos" descricao="Pix dos pedidos: acompanhe as cobranças e configure sua chave." />
      <div className="mb-4">
        <SegmentedControl ariaLabel="Seção de pagamentos" value={aba} onChange={setAba} options={ABAS} />
      </div>
      {aba === 'cobrancas' ? <ListaPagamentos /> : <PixConfig />}
    </div>
  )
}
