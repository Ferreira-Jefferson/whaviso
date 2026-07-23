// Sino de notificações (H10.10, item 6): ícone com contador de não lidas no header comum
// (AppShell) + painel com o feed. Ao abrir, marca tudo como lido (mecanismo do backend:
// mais simples, cobre o caso de uso real). Clique num item navega para o combinado
// (origem 'cobrador') ou para /app/creditos (origem 'billing'), e fecha o painel.
//
// Rótulos PRÓPRIOS desta central (NÃO é ROTULO_EVENTO de shared/format: aquele é para
// `TipoEvento`, a linha do tempo dentro de um combinado; aqui é `TipoNotificacaoCentral`,
// a outbox). Neutros de gênero, sem palavras proibidas, sem travessão.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bell } from 'lucide-react'
import { cn } from '@/shared/ui'
import { dataHoraPtBR } from '@/shared/format'
import {
  useMarcarNotificacoesLidas,
  useNotificacoesCentral,
  type NotificacaoCentral,
  type TipoNotificacaoCentral,
} from '../api'

const ROTULO_NOTIFICACAO_CENTRAL: Record<TipoNotificacaoCentral, string> = {
  pagamento_informado: 'Informou que pagou um combinado',
  combinado_dado_incorreto: 'Reportou um dado incorreto num combinado',
  recarga: 'Solicitação de créditos enviada pelo WhatsApp',
}

export function SinoNotificacoes() {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { data } = useNotificacoesCentral()
  const marcarLidas = useMarcarNotificacoesLidas()

  const naoLidas = data?.nao_lidas ?? 0
  const itens = data?.itens ?? []

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  function alternar() {
    setAberto((atual) => {
      const proximo = !atual
      if (proximo && naoLidas > 0) marcarLidas.mutate()
      return proximo
    })
  }

  function irParaItem(item: NotificacaoCentral) {
    setAberto(false)
    if (item.origem === 'cobrador' && item.aviso_id) {
      navigate(`/app/avisos/${item.aviso_id}`)
    } else {
      navigate('/app/creditos')
    }
  }

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
        className="relative flex items-center justify-center rounded-input p-2 text-tinta-2 transition-colors hover:bg-papel hover:text-tinta"
      >
        <Bell strokeWidth={1.75} className="size-5" />
        {naoLidas > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-barro text-[10px] font-medium leading-none text-papel">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações"
          className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-linha bg-cartao shadow-[0_12px_40px_rgba(32,50,42,0.18)]"
        >
          <div className="border-b border-linha px-4 py-3">
            <span className="font-display text-sm font-semibold text-salvia">Notificações</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {itens.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-tinta-2">
                Nenhuma notificação por aqui ainda.
              </p>
            ) : (
              itens.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => irParaItem(item)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-linha px-4 py-3 text-left text-sm last:border-0 transition-colors hover:bg-papel',
                    !item.lida && 'bg-salvia-claro/40',
                  )}
                >
                  <span className="text-tinta">{ROTULO_NOTIFICACAO_CENTRAL[item.tipo]}</span>
                  <span className="text-xs text-tinta-2">{dataHoraPtBR(item.criado_em)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
