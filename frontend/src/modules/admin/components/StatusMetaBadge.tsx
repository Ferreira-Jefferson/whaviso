// Badge do status do template na Meta (pendente/aprovado/rejeitado).
// Próprio do admin (StatusBadge do shared é só para status de aviso). Cores da
// paleta editorial; rótulo em shared/format. Linguagem das Regras de Ouro.
import type { StatusMetaTemplate } from '@/shared/contracts'
import { ROTULO_STATUS_META } from '@/shared/format'
import { cn } from '@/shared/ui'

const ESTILO: Record<StatusMetaTemplate, string> = {
  pendente: 'bg-ambar-claro text-ambar',
  aprovado: 'bg-salvia-claro text-folha',
  rejeitado: 'bg-papel-2 text-barro',
}

export function StatusMetaBadge({ status }: { status: StatusMetaTemplate }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-3 py-1 text-xs font-medium',
        ESTILO[status],
      )}
    >
      {ROTULO_STATUS_META[status]}
    </span>
  )
}
