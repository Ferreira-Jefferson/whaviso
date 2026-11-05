// Suporte da loja (dono/gerente): duas abas.
//  - "Chamados": abre chamados e conversa com a equipe Whaviso.
//  - "Acesso da equipe": concede/revoga o acesso assistido (consentimento) as conversas da loja.
// Guardada por `suporte_loja:gerir` no menu; a api decide o acesso real (403).
import { useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { cn, PageHeader, Tabs, useToast, type TabItem } from '@/shared/ui'
import { useAbrirChamado, useChamados } from '../api'
import { ListaChamados } from '../components/ListaChamados'
import { PainelChamado } from '../components/PainelChamado'
import { NovoChamadoDialog } from '../components/NovoChamadoDialog'
import { PainelAcessos } from '../components/PainelAcessos'

export default function Suporte() {
  const [aba, setAba] = useState('chamados')
  const abas: ReadonlyArray<TabItem> = [
    { id: 'chamados', rotulo: 'Chamados', conteudo: <PainelChamados /> },
    { id: 'acesso', rotulo: 'Acesso da equipe', conteudo: <PainelAcessos /> },
  ]
  return (
    <div>
      <PageHeader
        titulo="Suporte"
        descricao="Fale com a equipe Whaviso e gerencie o acesso temporário dela às suas conversas."
      />
      <Tabs itens={abas} ativa={aba} aoMudar={setAba} ariaLabel="Seções do suporte" />
    </div>
  )
}

function PainelChamados() {
  const chamados = useChamados()
  const abrir = useAbrirChamado()
  const { mostrarToast } = useToast()
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [abrirNovo, setAbrirNovo] = useState(false)
  const [erroNovo, setErroNovo] = useState<string | null>(null)

  function confirmarNovo(dados: { assunto: string; mensagem: string }) {
    setErroNovo(null)
    abrir.mutate(dados, {
      onSuccess: (chamado) => {
        setAbrirNovo(false)
        setSelecionadoId(chamado.id)
        mostrarToast('Chamado aberto.', { tom: 'sucesso' })
      },
      onError: (e) => setErroNovo(e instanceof ApiError ? e.message : 'Não foi possível abrir o chamado.'),
    })
  }

  return (
    <div className="flex h-[calc(100dvh-220px)] min-h-[480px] flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-card border border-linha bg-cartao">
        <ListaChamados
          query={chamados}
          selecionadoId={selecionadoId}
          aoSelecionar={setSelecionadoId}
          aoAbrirNovo={() => { setErroNovo(null); setAbrirNovo(true) }}
          className={cn('w-full md:w-[340px] md:flex-none md:border-r md:border-linha', selecionadoId && 'hidden md:flex')}
        />

        {selecionadoId ? (
          <PainelChamado key={selecionadoId} chamadoId={selecionadoId} aoVoltar={() => setSelecionadoId(null)} className="flex-1" />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-papel-2 px-6 text-center text-tinta-2 md:flex">
            <LifeBuoy className="size-9 text-salvia" aria-hidden />
            <p className="max-w-xs text-sm">Escolha um chamado à esquerda ou abra um novo para falar com a equipe Whaviso.</p>
          </div>
        )}
      </div>

      <NovoChamadoDialog
        aberto={abrirNovo}
        carregando={abrir.isPending}
        erro={erroNovo}
        onConfirmar={confirmarNovo}
        onFechar={() => setAbrirNovo(false)}
      />
    </div>
  )
}
