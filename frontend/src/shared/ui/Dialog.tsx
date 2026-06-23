// Dialog / ConfirmDialog: modal acessível via <dialog> nativo.
// Sombra única e difusa (design system seção 1); fecha em Esc/backdrop.
// ConfirmDialog: confirmação pessimista (ex.: encerrar lembretes, risco nº 3).
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { cn } from './cn'

interface DialogProps {
  aberto: boolean
  onFechar: () => void
  titulo: string
  children?: ReactNode
  /** Rodapé de ações; se ausente, nenhum botão é renderizado. */
  acoes?: ReactNode
  className?: string
}

export function Dialog({ aberto, onFechar, titulo, children, acoes, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (aberto && !el.open) el.showModal()
    else if (!aberto && el.open) el.close()
  }, [aberto])

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-titulo"
      onClose={onFechar}
      onCancel={onFechar}
      onClick={(e) => {
        // Clique no backdrop (fora do conteúdo) fecha.
        if (e.target === ref.current) onFechar()
      }}
      className={cn(
        'm-auto w-[calc(100vw-2rem)] max-w-sm rounded-card border border-linha bg-cartao p-6',
        'text-tinta shadow-[0_12px_40px_rgba(32,50,42,0.18)] backdrop:bg-tinta/30',
        className,
      )}
    >
      <h2 id="dialog-titulo" className="font-display text-xl font-semibold text-salvia">
        {titulo}
      </h2>
      {children && <div className="mt-3 text-sm text-tinta-2">{children}</div>}
      {acoes && <div className="mt-6 flex flex-col gap-2">{acoes}</div>}
    </dialog>
  )
}

interface ConfirmDialogProps {
  aberto: boolean
  titulo: string
  children?: ReactNode
  textoConfirmar?: string
  textoCancelar?: string
  variante?: 'primary' | 'destructive'
  carregando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

export function ConfirmDialog({
  aberto,
  titulo,
  children,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Voltar',
  variante = 'primary',
  carregando = false,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  return (
    <Dialog
      aberto={aberto}
      onFechar={onCancelar}
      titulo={titulo}
      acoes={
        <>
          <Button
            variante={variante}
            loading={carregando}
            className="w-full"
            onClick={onConfirmar}
          >
            {textoConfirmar}
          </Button>
          <Button
            variante="secondary"
            className="w-full"
            disabled={carregando}
            onClick={onCancelar}
          >
            {textoCancelar}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}
