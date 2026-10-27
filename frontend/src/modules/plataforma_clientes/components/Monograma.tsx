// Monograma com as iniciais de uma conta ou pessoa: da rosto e hierarquia as listas do console
// sem depender de foto. Forma quadrada (arredondada) para contas (negocio) e redonda para pessoas.
import { cn } from '@/shared/ui'

/** Extrai ate duas iniciais de um nome, com guarda para acesso indexado. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase() || '?'
}

export function Monograma({
  nome,
  forma = 'quadrado',
  inativo = false,
  className,
}: {
  nome: string
  /** `quadrado` para contas (negocio); `redondo` para pessoas. */
  forma?: 'quadrado' | 'redondo'
  inativo?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 flex-none items-center justify-center bg-salvia-claro text-xs font-bold text-salvia',
        forma === 'quadrado' ? 'rounded-input' : 'rounded-full',
        inativo && 'opacity-50',
        className,
      )}
    >
      {iniciaisDe(nome)}
    </span>
  )
}
