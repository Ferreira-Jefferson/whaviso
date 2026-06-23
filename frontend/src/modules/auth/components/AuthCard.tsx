import type { ReactNode } from 'react'
import { Card } from '@/shared/ui'

interface AuthCardProps {
  titulo: string
  subtitulo?: string
  children: ReactNode
  rodape?: ReactNode
}

// Moldura editorial das telas de auth: título serifado + subtítulo + conteúdo.
export function AuthCard({ titulo, subtitulo, children, rodape }: AuthCardProps) {
  return (
    <div className="animate-rise">
      <Card className="p-6">
        <h1 className="font-display text-2xl text-salvia">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-tinta-2">{subtitulo}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {rodape && (
        <div className="mt-4 text-center text-sm text-tinta-2">{rodape}</div>
      )}
    </div>
  )
}
