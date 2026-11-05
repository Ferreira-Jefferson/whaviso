// /plataforma/suporte: console do OPERADOR Whaviso. Fila de chamados de todas as lojas (filtro por
// status, paginacao por cursor) a esquerda; a direita, o chamado aberto com as mensagens, a caixa de
// resposta do operador, o estado de consentimento da loja e, quando ha acesso assistido ativo, o
// visualizador READ-ONLY das conversas daquela loja. A api decide o acesso real (403 vira aviso).
import { useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import { cn, PageHeader } from '@/shared/ui'
import { useFilaChamados } from '../api'
import { FilaChamados } from '../components/FilaChamados'
import { PainelChamado } from '../components/PainelChamado'
import type { FiltroStatus } from '../rotulos'

export default function Suporte() {
  const [filtro, setFiltro] = useState<FiltroStatus>('todas')
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const fila = useFilaChamados(filtro === 'todas' ? undefined : filtro)

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Suporte"
        descricao="Chamados de todas as lojas. Com o consentimento da loja, veja as conversas dela (somente leitura) para ajudar."
      />

      <div className="flex h-[calc(100dvh-200px)] min-h-[520px] overflow-hidden rounded-card border border-linha bg-cartao">
        <FilaChamados
          filtro={filtro}
          aoMudarFiltro={setFiltro}
          query={fila}
          selecionadoId={selecionadoId}
          aoSelecionar={setSelecionadoId}
          className={cn('w-full lg:w-[360px] lg:flex-none lg:border-r lg:border-linha', selecionadoId && 'hidden lg:flex')}
        />

        {selecionadoId ? (
          <PainelChamado key={selecionadoId} chamadoId={selecionadoId} aoVoltar={() => setSelecionadoId(null)} className="flex-1" />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-papel-2 px-6 text-center text-tinta-2 lg:flex">
            <LifeBuoy className="size-9 text-salvia" aria-hidden />
            <p className="max-w-xs text-sm">Escolha um chamado na fila para ver as mensagens e responder.</p>
          </div>
        )}
      </div>
    </div>
  )
}
