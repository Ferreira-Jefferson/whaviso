// TODO(pivo): StatusBadge era de status de aviso (legado); trocar por status de pedido (kanban).
// Os rótulos de aviso foram removidos de shared/format; por ora exibe o valor cru.
import type { StatusAviso } from '../contracts'
import { cn } from './cn'

const ESTILO: Record<StatusAviso, string> = {
  sem_aviso: 'bg-papel-2 text-cinza-expirado',
  aguardando_aceite: 'bg-salvia-claro text-salvia',
  programado: 'bg-ambar-claro text-ambar',
  aguardando_aprovacao_aviso_editado: 'bg-ambar-claro text-ambar',
  aguardando_aprovacao_dado_incorreto: 'bg-ambar-claro text-ambar',
  pausado: 'bg-papel-2 text-barro',
  informado_pago: 'bg-revisao-claro text-revisao',
  desregistrado: 'bg-papel-2 text-barro',
  pago: 'bg-salvia-claro text-folha',
  cancelado: 'bg-papel-2 text-barro',
  recusado: 'bg-papel-2 text-barro',
  expirado: 'bg-papel-2 text-cinza-expirado',
}

export function StatusBadge({ status }: { status: StatusAviso }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-3 py-1 text-xs font-medium',
        ESTILO[status],
      )}
    >
      {status}
    </span>
  )
}
