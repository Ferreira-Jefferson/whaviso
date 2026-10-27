// Cartao de estado derivado: a loja esta aceitando pedidos agora? O atendente pode responder?
// Tudo decidido no servidor (fuso America/Sao_Paulo); aqui so exibimos o que a api devolveu.
import { CheckCircle2, Clock, MessageSquareDot, MessageSquareOff, XCircle } from 'lucide-react'
import { Skeleton, cn } from '@/shared/ui'
import { formatarHora } from '@/shared/format'
import type { DisponibilidadeAgoraSaida } from '@/shared/contracts/_generated/disponibilidade'

export function EstadoAgora({
  dados,
  carregando,
}: {
  dados: DisponibilidadeAgoraSaida | undefined
  carregando: boolean
}) {
  if (carregando && !dados) {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-linha bg-cartao p-4 sm:flex-row sm:items-center sm:gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-48" />
      </div>
    )
  }
  if (!dados) return null

  const aceita = dados.aceitando_agora
  const atende = dados.atendente_pode_responder

  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        aceita ? 'border-folha/30 bg-salvia-claro' : 'border-barro/30 bg-ambar-claro',
      )}
    >
      <div className="flex items-start gap-3">
        {aceita ? (
          <CheckCircle2 className="mt-0.5 size-6 flex-none text-folha" strokeWidth={1.75} aria-hidden />
        ) : (
          <XCircle className="mt-0.5 size-6 flex-none text-barro" strokeWidth={1.75} aria-hidden />
        )}
        <div className="min-w-0">
          <p className={cn('font-display text-lg font-semibold leading-tight', aceita ? 'text-folha' : 'text-barro')}>
            {aceita ? 'Aceitando pedidos agora' : 'Fora do horário agora'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-tinta-2">
            <Clock className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden />
            Agora são {formatarHora(dados.agora)} (horário de Brasília)
          </p>
        </div>
      </div>

      <p
        className={cn(
          'inline-flex items-center gap-1.5 self-start rounded-pill px-3 py-1 text-sm font-medium sm:self-center',
          atende ? 'bg-cartao text-salvia' : 'bg-cartao text-tinta-2',
        )}
      >
        {atende ? (
          <MessageSquareDot className="size-4 flex-none" strokeWidth={1.75} aria-hidden />
        ) : (
          <MessageSquareOff className="size-4 flex-none" strokeWidth={1.75} aria-hidden />
        )}
        {atende ? 'Atendente respondendo' : 'Atendente em silêncio'}
      </p>
    </div>
  )
}
