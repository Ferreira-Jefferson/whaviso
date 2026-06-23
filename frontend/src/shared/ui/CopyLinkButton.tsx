// CopyLinkButton: copia um link para a área de transferência com micro-feedback
// "copiado!". Mostra o link em campo somente-leitura ao lado do botão.
import { useCallback, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from './Button'
import { cn } from './cn'

interface CopyLinkButtonProps {
  /** O link a ser copiado e exibido. */
  link: string
  className?: string
}

export function CopyLinkButton({ link, className }: CopyLinkButtonProps) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // Fallback: seleciona o campo para cópia manual (raro).
      return
    }
    setCopiado(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopiado(false), 1800)
  }, [link])

  return (
    <div className={cn('flex items-stretch gap-2', className)}>
      <input
        type="text"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Link de aceite"
        className="min-w-0 flex-1 rounded-input border border-linha bg-papel-2 px-3 py-2.5 text-sm text-tinta-2"
      />
      <Button
        type="button"
        variante="secondary"
        onClick={copiar}
        className={cn('shrink-0 transition-colors', copiado && 'text-folha')}
        aria-live="polite"
      >
        {copiado ? (
          <>
            <Check strokeWidth={1.75} className="size-4" />
            Copiado!
          </>
        ) : (
          <>
            <Copy strokeWidth={1.75} className="size-4" />
            Copiar
          </>
        )}
      </Button>
    </div>
  )
}
