// Sino de notificações (H10.10, item 6): ícone com contador de não lidas no header comum
// (AppShell). Vira só um ATALHO: nenhum dropdown próprio, o clique leva direto para a
// página /app/notificacoes, que reúne "precisa de você" (H9.2) e o histórico completo
// paginado. Marcar como lida acontece POR ITEM, só ao clicar na notificação específica
// (dentro da página); abrir/clicar aqui nunca marca nada em massa.
import { useNavigate } from 'react-router'
import { Bell } from 'lucide-react'
import { useNotificacoesCentral } from '../api'

export function SinoNotificacoes() {
  const navigate = useNavigate()
  const { data } = useNotificacoesCentral()
  const naoLidas = data?.nao_lidas ?? 0

  return (
    <button
      type="button"
      onClick={() => navigate('/app/notificacoes')}
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
  )
}
