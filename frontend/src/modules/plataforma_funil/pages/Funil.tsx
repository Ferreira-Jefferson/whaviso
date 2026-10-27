// Console do operador: CRM de aquisicao da Whaviso. Abas Quadro, Lista e Agenda; o detalhe do
// prospecto abre num dialog (estagio, vinculo com conta, atividades e follow-ups).
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, PageHeader, Tabs, type TabItem } from '@/shared/ui'
import { AgendaFunil } from '../components/AgendaFunil'
import { ListaProspectos } from '../components/ListaProspectos'
import { ProspectoDialog } from '../components/ProspectoDialog'
import { ProspectoFormDialog } from '../components/ProspectoFormDialog'
import { QuadroFunil } from '../components/QuadroFunil'

export default function Funil() {
  const [aba, setAba] = useState('quadro')
  const [aberto, setAberto] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  const abas: ReadonlyArray<TabItem> = [
    { id: 'quadro', rotulo: 'Quadro', conteudo: <QuadroFunil aoAbrir={setAberto} /> },
    { id: 'lista', rotulo: 'Lista', conteudo: <ListaProspectos aoAbrir={setAberto} /> },
    { id: 'agenda', rotulo: 'Agenda', conteudo: <AgendaFunil aoAbrir={setAberto} /> },
  ]

  return (
    <div>
      <PageHeader
        titulo="Funil de aquisição"
        descricao="Restaurantes que a Whaviso quer conquistar, do primeiro contato ao cadastro."
        acoes={
          <Button onClick={() => setCriando(true)}>
            <Plus className="size-4" aria-hidden />
            Novo prospecto
          </Button>
        }
      />
      <Tabs itens={abas} ativa={aba} aoMudar={setAba} ariaLabel="Seções do funil" />
      <ProspectoDialog prospectoId={aberto} aoFechar={() => setAberto(null)} />
      <ProspectoFormDialog aberto={criando} prospecto={null} aoFechar={() => setCriando(false)} aoCriar={setAberto} />
    </div>
  )
}
