// /conhecimento: curadoria da base que o atendente usa para responder. Tres abas: documentos
// (rascunho, aprovado, arquivado), perguntas de teste (golden set) e sugestoes (triagem da
// realimentacao). Rota 'conhecimento' (grupo config).
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '@/shared/ui'
import { TabAvaliacao } from '../components/TabAvaliacao'
import { TabDocumentos } from '../components/TabDocumentos'
import { TabFeedback } from '../components/TabFeedback'

type Aba = 'documentos' | 'avaliacao' | 'sugestoes'

export default function Conhecimento() {
  const [aba, setAba] = useState<Aba>('documentos')
  const itens: TabItem[] = [
    { id: 'documentos', rotulo: 'Documentos', conteudo: <TabDocumentos /> },
    { id: 'avaliacao', rotulo: 'Perguntas de teste', conteudo: <TabAvaliacao /> },
    { id: 'sugestoes', rotulo: 'Sugestões', conteudo: <TabFeedback /> },
  ]
  return (
    <div>
      <PageHeader
        titulo="Conhecimento"
        descricao="O que o atendente sabe sobre a sua loja. Só conteúdo que não muda toda hora."
      />
      <Tabs itens={itens} ativa={aba} aoMudar={(id) => setAba(id as Aba)} ariaLabel="Seções do conhecimento" />
    </div>
  )
}
