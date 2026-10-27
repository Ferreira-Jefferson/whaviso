// Console do operador: cobranca restaurante -> Whaviso. Abas Faturas, Assinaturas e Rotinas.
// Conferencia de pagamento manual na v1 (o operador da baixa na fatura), sem gateway.
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '@/shared/ui'
import { PainelAssinaturas } from '../components/PainelAssinaturas'
import { PainelFaturas } from '../components/PainelFaturas'
import { PainelRotinas } from '../components/PainelRotinas'

export default function Cobranca() {
  const [aba, setAba] = useState('faturas')
  const abas: ReadonlyArray<TabItem> = [
    { id: 'faturas', rotulo: 'Faturas', conteudo: <PainelFaturas /> },
    { id: 'assinaturas', rotulo: 'Assinaturas', conteudo: <PainelAssinaturas /> },
    { id: 'rotinas', rotulo: 'Rotinas', conteudo: <PainelRotinas /> },
  ]
  return (
    <div>
      <PageHeader titulo="Cobrança" descricao="Assinaturas, faturas e suspensão dos restaurantes clientes." />
      <Tabs itens={abas} ativa={aba} aoMudar={setAba} ariaLabel="Seções de cobrança" />
    </div>
  )
}
