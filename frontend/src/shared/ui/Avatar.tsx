// Avatar: inicial do nome num circulo (ou quadrado), identidade de pessoa/conta/loja.
// Consolida as copias locais (clientes, pessoas, motoboys, conversas, avaliacoes,
// fidelidade, despacho, plataforma_clientes). Decorativo (aria-hidden): o nome sempre
// aparece ao lado em texto.
import { cn } from './cn'

type Tamanho = 'sm' | 'md' | 'lg'
type Forma = 'redondo' | 'quadrado'
type Tom = 'marca' | 'neutro'

const DIMENSOES: Record<Tamanho, string> = {
  sm: 'size-8 text-sm',
  md: 'size-9 text-sm',
  lg: 'size-12 text-base',
}

const TONS: Record<Tom, string> = {
  marca: 'bg-salvia-claro text-salvia',
  neutro: 'bg-papel-2 text-tinta-2',
}

/** Primeira letra do nome em maiuscula; `?` quando nao ha nome. */
function inicial(nome: string | null | undefined): string {
  const letra = (nome ?? '').trim().charAt(0)
  return letra ? letra.toUpperCase() : '?'
}

interface AvatarProps {
  nome: string | null | undefined
  tamanho?: Tamanho
  forma?: Forma
  tom?: Tom
  /** Esmaece quando o item esta arquivado/desativado. */
  inativo?: boolean
  className?: string
}

export function Avatar({ nome, tamanho = 'md', forma = 'redondo', tom = 'marca', inativo = false, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex flex-none items-center justify-center font-bold',
        forma === 'redondo' ? 'rounded-full' : 'rounded-input',
        DIMENSOES[tamanho],
        TONS[tom],
        inativo && 'opacity-50',
        className,
      )}
    >
      {inicial(nome)}
    </span>
  )
}
