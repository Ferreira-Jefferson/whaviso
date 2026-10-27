// IconChip: chip circular com um icone, tingido por tom. Consolida o padrao
// "size-N rounded-full bg-<tom>-claro text-<tom>" repetido em dashboard, custos,
// zonas, onboarding, fidelidade, numeros, fiscal, canais, fluxo. Decorativo: o
// significado vive no texto ao lado (passe aria-hidden no icone).
import type { ReactNode } from 'react'
import { cn } from './cn'

type Tom = 'salvia' | 'folha' | 'ambar' | 'barro' | 'dourado' | 'revisao' | 'neutro'
type Tamanho = 'sm' | 'md'

const TONS: Record<Tom, string> = {
  salvia: 'bg-salvia-claro text-salvia',
  folha: 'bg-folha/10 text-folha',
  ambar: 'bg-ambar-claro text-ambar',
  barro: 'bg-barro/10 text-barro',
  dourado: 'bg-dourado-claro text-dourado',
  revisao: 'bg-revisao-claro text-revisao',
  neutro: 'bg-papel-2 text-tinta-2',
}

const DIMENSOES: Record<Tamanho, string> = {
  sm: 'size-8',
  md: 'size-10',
}

export function IconChip({
  children,
  tom = 'salvia',
  tamanho = 'md',
  className,
}: {
  children: ReactNode
  tom?: Tom
  tamanho?: Tamanho
  className?: string
}) {
  return (
    <span className={cn('flex flex-none items-center justify-center rounded-full', DIMENSOES[tamanho], TONS[tom], className)}>
      {children}
    </span>
  )
}
