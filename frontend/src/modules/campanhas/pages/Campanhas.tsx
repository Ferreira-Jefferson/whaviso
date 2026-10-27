// Campanhas de WhatsApp da loja: lista, criacao (template + segmento), previa do publico sem
// opt-out, disparo e acompanhamento. Dados pela api REST (raiz ['campanhas']). Rota /campanhas.
import { useState } from 'react'
import { Megaphone, Plus } from 'lucide-react'
import { formatarData } from '@/shared/format'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { useCampanhas, type Campanha } from '../api'
import { DetalheCampanhaDialog } from '../components/DetalheCampanhaDialog'
import { NovaCampanhaDialog } from '../components/NovaCampanhaDialog'
import { ROTULO_STATUS, rotuloPublico, TOM_STATUS } from '../estados'

const COLUNAS: ReadonlyArray<ColunaTabela<Campanha>> = [
  { chave: 'nome', titulo: 'Campanha', principal: true, render: (c) => <span className="font-medium">{c.nome}</span> },
  { chave: 'status', titulo: 'Status', render: (c) => <Badge tom={TOM_STATUS[c.status]}>{ROTULO_STATUS[c.status]}</Badge> },
  { chave: 'publico', titulo: 'Público', render: (c) => <span className="text-tinta-2">{rotuloPublico(c.filtro.segmento)}</span> },
  {
    chave: 'dest',
    titulo: 'Destinatários',
    alinhar: 'direita',
    render: (c) => (
      <span className="tabular-nums">{c.status === 'rascunho' ? '-' : c.total_destinatarios}</span>
    ),
  },
  {
    chave: 'data',
    titulo: 'Data',
    alinhar: 'direita',
    render: (c) => <span className="tabular-nums text-tinta-2">{formatarData(c.enfileirado_em ?? c.criado_em)}</span>,
  },
]

export default function Campanhas() {
  const lista = useCampanhas()
  const [criando, setCriando] = useState(false)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const itens = lista.data?.itens ?? []

  const botaoNova = (
    <Button onClick={() => setCriando(true)}>
      <Plus className="size-4" aria-hidden />
      Nova campanha
    </Button>
  )

  return (
    <div>
      <PageHeader titulo="Campanhas" descricao="Mensagens de WhatsApp para quem já pediu na sua loja." acoes={botaoNova} />

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando campanhas" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<Megaphone className="size-7" aria-hidden />}
          titulo="Nenhuma campanha ainda"
          descricao="Crie uma campanha para chamar de volta quem sumiu ou avisar de uma novidade. Quem pediu para não receber fica sempre de fora."
          acao={botaoNova}
        />
      )}
      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive
          colunas={COLUNAS}
          linhas={itens}
          chaveLinha={(c) => c.id}
          onRowClick={(c) => setAbertoId(c.id)}
          legenda="Campanhas"
        />
      )}

      <NovaCampanhaDialog aberto={criando} aoFechar={() => setCriando(false)} aoCriar={setAbertoId} />
      <DetalheCampanhaDialog id={abertoId} aoFechar={() => setAbertoId(null)} />
    </div>
  )
}
