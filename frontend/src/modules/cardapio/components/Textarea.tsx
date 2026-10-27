// Textarea: campo de texto multilinha no estilo do Input do design system.
// Primitivo local do modulo cardapio (candidato a promover para @/shared/ui).
import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/shared/ui'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Marca o campo como invalido (borda barro + aria-invalid). */
  invalido?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalido, rows = 3, ...rest }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalido || undefined}
        className={cn(
          'w-full resize-y rounded-input border bg-cartao px-3 py-2.5 text-sm text-tinta',
          'placeholder:text-tinta-2/60',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalido ? 'border-barro' : 'border-linha',
          className,
        )}
        {...rest}
      />
    )
  },
)
Textarea.displayName = 'Textarea'
