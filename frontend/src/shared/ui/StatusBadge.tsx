// StatusBadge: ÚNICA FONTE de cor + rótulo de status do aviso (plano seção 1).
// Linguagem segue as Regras de Ouro (rótulos em shared/format).
import type { PapelAviso, StatusAviso } from '../contracts'
import { rotuloStatusAviso } from '../format'
import { cn } from './cn'

const ESTILO: Record<StatusAviso, string> = {
  sem_aviso: 'bg-papel-2 text-cinza-expirado',
  aguardando_aceite: 'bg-salvia-claro text-salvia',
  programado: 'bg-ambar-claro text-ambar',
  aguardando_aprovacao_aviso_editado: 'bg-ambar-claro text-ambar',
  pausado: 'bg-papel-2 text-barro',
  informado_pago: 'bg-revisao-claro text-revisao',
  desregistrado: 'bg-papel-2 text-barro',
  pago: 'bg-salvia-claro text-folha',
  cancelado: 'bg-papel-2 text-barro',
  recusado: 'bg-papel-2 text-barro',
  expirado: 'bg-papel-2 text-cinza-expirado',
}

// `papel` (opcional): papel do usuário NAQUELE combinado, para o rótulo relativo da
// H9.3 (cobrador vê `informado_pago` como "Aguardando sua confirmação").
export function StatusBadge({
  status,
  papel,
}: {
  status: StatusAviso
  papel?: PapelAviso | null
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-3 py-1 text-xs font-medium',
        ESTILO[status],
      )}
    >
      {rotuloStatusAviso(status, papel ?? undefined)}
    </span>
  )
}
