import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/shared/ui'
import { useConversas } from '../api'
import { ListaConversas } from '../components/ListaConversas'
import { PainelConversa } from '../components/PainelConversa'
import type { FiltroStatus } from '../estados'

/**
 * Atendimento pelo WhatsApp: lista de conversas (filtro por estado) a esquerda e o painel da
 * conversa selecionada a direita. No mobile vira uma coluna so: a lista, e ao abrir uma
 * conversa, o painel com um botao de voltar. Atualiza ao vivo pelo realtime (['conversas']).
 */
export default function Conversas() {
  const [status, setStatus] = useState<FiltroStatus>('todas')
  const [busca, setBusca] = useState('')
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)

  const conversas = useConversas({
    status: status === 'todas' ? undefined : status,
    busca: busca.trim() || undefined,
  })

  return (
    <div className="flex h-[calc(100dvh-152px)] min-h-[520px] flex-col md:h-[calc(100dvh-136px)]">
      <header className="flex-none pb-3">
        <h1 className="text-2xl text-salvia md:text-3xl">Conversas</h1>
        <p className="mt-1 text-sm text-tinta-2">Atendimento pelo WhatsApp. Atualiza sozinho quando chega mensagem.</p>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-card border border-linha bg-cartao">
        <ListaConversas
          status={status}
          aoMudarStatus={setStatus}
          busca={busca}
          aoMudarBusca={setBusca}
          query={conversas}
          selecionadaId={selecionadaId}
          aoSelecionar={setSelecionadaId}
          className={cn('w-full md:w-[340px] md:flex-none md:border-r md:border-linha', selecionadaId && 'hidden md:flex')}
        />

        {selecionadaId ? (
          <PainelConversa
            key={selecionadaId}
            conversaId={selecionadaId}
            aoVoltar={() => setSelecionadaId(null)}
            className="flex-1"
          />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-papel-2 px-6 text-center text-tinta-2 md:flex">
            <MessageCircle className="size-9 text-salvia" aria-hidden />
            <p className="max-w-xs text-sm">Escolha uma conversa à esquerda para ver o histórico e responder.</p>
          </div>
        )}
      </div>
    </div>
  )
}
