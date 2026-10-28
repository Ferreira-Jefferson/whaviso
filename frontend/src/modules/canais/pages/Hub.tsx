// Canais de pedido da loja numa tela so, em abas: os canais externos (iFood e outros) e os numeros
// de WhatsApp conectados. Os numeros eram um modulo proprio (/numeros), absorvidos aqui: um numero
// e um tipo de canal. Rota /canais.
import { useState } from 'react'
import { SegmentedControl } from '@/shared/ui'
import Canais from './Canais'
import Numeros from '../numeros/pages/Numeros'

type Aba = 'canais' | 'numeros'

const ABAS = [
  { value: 'canais', label: 'Canais' },
  { value: 'numeros', label: 'Números de WhatsApp' },
] as const

export default function CanaisHub() {
  const [aba, setAba] = useState<Aba>('canais')
  return (
    <div>
      <div className="mb-4">
        <SegmentedControl ariaLabel="Seção de canais" value={aba} onChange={setAba} options={ABAS} />
      </div>
      {aba === 'canais' ? <Canais /> : <Numeros />}
    </div>
  )
}
