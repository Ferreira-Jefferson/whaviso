// /roteirizacao: sugestao automatica de corridas (tempo de preparo + proximidade). Duas abas:
// "Sugestões" (gerar, ajustar a ordem e aceitar) e "Configuração" (parametros da loja).
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '@/shared/ui'
import { PainelConfig } from '../components/PainelConfig'
import { PainelSugestoes } from '../components/PainelSugestoes'

export default function Roteirizacao() {
  const [aba, setAba] = useState('sugestoes')

  const abas: ReadonlyArray<TabItem> = [
    { id: 'sugestoes', rotulo: 'Sugestões', conteudo: <PainelSugestoes /> },
    { id: 'config', rotulo: 'Configuração', conteudo: <PainelConfig /> },
  ]

  return (
    <div>
      <PageHeader
        titulo="Roteirização"
        descricao="Sugestões de corridas por tempo de preparo e proximidade dos endereços."
      />
      <Tabs itens={abas} ativa={aba} aoMudar={setAba} ariaLabel="Seções da roteirização" />
    </div>
  )
}
