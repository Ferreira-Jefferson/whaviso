// Overlay de modal via portal para o document.body. Motivo: as páginas do app vivem dentro
// de um `.animate-rise` cujo `transform` (fill-mode both) vira bloco de contenção do
// `position: fixed`, prendendo o overlay ao tamanho do container. No body o `inset-0` cobre a
// viewport inteira. Padrão do RevisarModal/EditarModal, extraído para reuso (produto/cliente).
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { Card } from './Card'
import { cn } from './cn'

export function ModalPortal({
  ariaLabel,
  onFechar,
  children,
  className,
}: {
  ariaLabel: string
  onFechar: () => void
  children: ReactNode
  className?: string
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={(e) => {
        // Clique no backdrop (fora do conteúdo) fecha.
        if (e.target === e.currentTarget) onFechar()
      }}
    >
      <Card className={cn('flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto', className)}>
        {children}
      </Card>
    </div>,
    document.body,
  )
}
