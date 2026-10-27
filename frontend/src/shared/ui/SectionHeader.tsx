// SectionHeader: cabecalho de secao dentro de uma pagina (titulo em font-display +
// contagem/meta opcional + acao opcional a direita). Consolida o padrao repetido em
// varios modulos (canais, fluxo, despacho, relatorios, plataforma_*).
import type { ReactNode } from 'react'
import { cn } from './cn'

interface SectionHeaderProps {
  titulo: string
  /** Texto curto a direita do titulo (ex.: "12 itens"). */
  meta?: ReactNode
  /** Acao a direita (ex.: um Button). */
  acao?: ReactNode
  className?: string
}

export function SectionHeader({ titulo, meta, acao, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <h2 className="flex items-baseline gap-2 font-display text-lg font-semibold text-salvia">
        {titulo}
        {meta != null && <span className="text-sm font-normal text-tinta-2">{meta}</span>}
      </h2>
      {acao}
    </div>
  )
}
