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
  largura = 'max-w-lg',
}: {
  ariaLabel: string
  onFechar: () => void
  children: ReactNode
  className?: string
  // Largura máxima no desktop (classe Tailwind max-w-*). No mobile é sempre w-full
  // com o padding do overlay. Default max-w-lg; conteúdo mais denso pede mais.
  largura?: string
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
      <Card className={cn('flex max-h-[85vh] w-full flex-col gap-4 overflow-y-auto', largura, className)}>
        {children}
      </Card>
    </div>,
    document.body,
  )
}
