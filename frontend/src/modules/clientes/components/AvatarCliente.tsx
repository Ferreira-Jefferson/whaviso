// Avatar de identidade do cliente: inicial do nome num circulo (mesma linguagem
// da lista de conversas). Decorativo (aria-hidden): o nome sempre aparece ao lado.
// Candidato a promover ao design system se reusado fora do modulo.
import { cn } from '@/shared/ui'

type Tamanho = 'md' | 'lg'

const DIMENSOES: Record<Tamanho, string> = {
  md: 'size-9 text-sm',
  lg: 'size-12 text-base',
}

/** Primeira letra do nome em maiuscula; `?` quando nao ha nome. */
function inicial(nome: string | null | undefined): string {
  const letra = (nome ?? '').trim().charAt(0)
  return letra ? letra.toUpperCase() : '?'
}

export function AvatarCliente({ nome, tamanho = 'md' }: { nome: string | null | undefined; tamanho?: Tamanho }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex flex-none items-center justify-center rounded-full bg-papel-2 font-bold text-tinta-2',
        DIMENSOES[tamanho],
      )}
    >
      {inicial(nome)}
    </span>
  )
}
