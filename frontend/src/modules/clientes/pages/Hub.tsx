// Clientes: a lista/ficha dos clientes e o CRM (segmentos, ticket, recorrencia) numa tela so, em abas.
// O CRM era um modulo proprio (/crm), absorvido aqui: e analise sobre a MESMA entidade cliente.
// Rota /clientes.
import { useState } from 'react'
import { SegmentedControl } from '@/shared/ui'
import Clientes from './Clientes'
import Crm from '../crm/pages/Crm'

type Aba = 'lista' | 'crm'

const ABAS = [
  { value: 'lista', label: 'Lista' },
  { value: 'crm', label: 'CRM' },
] as const

export default function ClientesHub() {
  const [aba, setAba] = useState<Aba>('lista')
  return (
    <div>
      <div className="mb-4">
        <SegmentedControl ariaLabel="Seção de clientes" value={aba} onChange={setAba} options={ABAS} />
      </div>
      {aba === 'lista' ? <Clientes /> : <Crm />}
    </div>
  )
}
