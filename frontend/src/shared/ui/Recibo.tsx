// Recibo: estado terminal/confirmação reutilizável (Fase 3).
// Mostra um ícone, título serifado e mensagem amigável; usado por todas as telas
// públicas de aceite/ação para estados idempotentes (já confirmado, encerrado,
// link inválido). Linguagem segue as Regras de Ouro (só "aviso/lembrete/combinado").
import type { ReactNode } from 'react'
import { CheckCircle2, BellOff, Clock, XCircle, Link2Off } from 'lucide-react'
import { Card } from './Card'
import { cn } from './cn'

export type ReciboTom = 'sucesso' | 'encerrado' | 'neutro' | 'aviso' | 'invalido'

const ICONES: Record<ReciboTom, typeof CheckCircle2> = {
  sucesso: CheckCircle2,
  encerrado: BellOff,
  neutro: Clock,
  aviso: XCircle,
  invalido: Link2Off,
}

const COR_ICONE: Record<ReciboTom, string> = {
  sucesso: 'text-folha',
  encerrado: 'text-tinta-2',
  neutro: 'text-ambar',
  aviso: 'text-barro',
  invalido: 'text-cinza-expirado',
}

interface ReciboProps {
  tom: ReciboTom
  titulo: string
  children?: ReactNode
  /** Ações (botões/links) abaixo da mensagem. */
  acoes?: ReactNode
}

export function Recibo({ tom, titulo, children, acoes }: ReciboProps) {
  const Icone = ICONES[tom]
  return (
    <Card className="flex flex-col items-center gap-4 py-8 text-center">
      <Icone strokeWidth={1.75} className={cn('size-12', COR_ICONE[tom])} />
      <h1 className="font-display text-2xl font-semibold text-salvia">{titulo}</h1>
      {children && <div className="text-sm text-tinta-2">{children}</div>}
      {acoes && <div className="mt-2 flex w-full flex-col gap-2">{acoes}</div>}
    </Card>
  )
}
