// Estrelas de 1 a 5 (somente exibicao). Leitor de tela le "Nota N de 5"; as estrelas sao decorativas.
import { Star } from 'lucide-react'
import { cn } from '@/shared/ui'

type Tamanho = 'sm' | 'md' | 'lg'

// Tamanho da estrela por contexto: sm (linha/lista), md, lg (numero-heroi do resumo).
const TAMANHO_ESTRELA: Record<Tamanho, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
}

export function Estrelas({
  nota,
  tamanho = 'sm',
  className,
}: {
  nota: number
  tamanho?: Tamanho
  className?: string
}) {
  const inteira = Math.round(nota)
  return (
    <span
      role="img"
      aria-label={`Nota ${nota.toString().replace('.', ',')} de 5`}
      className={cn('inline-flex gap-0.5', className)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          strokeWidth={1.75}
          className={cn(TAMANHO_ESTRELA[tamanho], n <= inteira ? 'fill-ambar text-ambar' : 'text-linha')}
        />
      ))}
    </span>
  )
}
