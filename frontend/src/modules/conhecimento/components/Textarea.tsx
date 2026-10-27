// Textarea: campo multilinha no estilo do Input do design system. Primitivo local do modulo
// conhecimento (mesmo desenho do cardapio; candidato a promover para @/shared/ui).
import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/shared/ui'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalido?: boolean }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalido, rows = 4, ...rest }, ref) => (
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
  ),
)
Textarea.displayName = 'Textarea'
