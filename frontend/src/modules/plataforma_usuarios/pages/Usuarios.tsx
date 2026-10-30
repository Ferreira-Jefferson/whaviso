// Console do operador: usuarios da Whaviso (donos de restaurante, equipe deles ou equipe interna).
// Abas "Contas" (lista + ficha) e "Equipe Whaviso" (operadores, so admin). So metadado: nunca
// conteudo de loja.
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '@/shared/ui'
import { PainelContas } from '../components/PainelContas'
import { PainelEquipe } from '../components/PainelEquipe'

export default function Usuarios() {
  const [aba, setAba] = useState('contas')
  const abas: ReadonlyArray<TabItem> = [
    { id: 'contas', rotulo: 'Contas', conteudo: <PainelContas /> },
    { id: 'equipe', rotulo: 'Equipe Whaviso', conteudo: <PainelEquipe /> },
  ]
  return (
    <div>
      <PageHeader titulo="Usuários" descricao="Restaurantes que usam a Whaviso e a equipe que opera a plataforma." />
      <Tabs itens={abas} ativa={aba} aoMudar={setAba} ariaLabel="Seções de usuários" />
    </div>
  )
}
