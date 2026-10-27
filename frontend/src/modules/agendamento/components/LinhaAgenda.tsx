// Uma linha da agenda: horario em destaque (colorido pela janela), codigo/modalidade/total
// e as acoes de reagendar e limpar. Uma faixa a esquerda repete a cor da janela para varredura.
import { CalendarClock, CalendarX2 } from 'lucide-react'
import { Badge, Button, Card, MoneyText, cn } from '@/shared/ui'
import { formatarHora } from '@/shared/format'
import type { AgendamentoDto } from '@/shared/contracts/_generated/agendamento'
import { BORDA_JANELA, COR_HORA_JANELA, ROTULO_JANELA, ROTULO_MODALIDADE, rotuloDia, TOM_JANELA } from '../estados'

interface Props {
  pedido: AgendamentoDto
  aoReagendar: (p: AgendamentoDto) => void
  aoLimpar: (p: AgendamentoDto) => void
}

export function LinhaAgenda({ pedido, aoReagendar, aoLimpar }: Props) {
  const quando = pedido.agendado_para
  const janela = pedido.janela
  return (
    <Card
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-3 border-l-4 p-4',
        janela ? BORDA_JANELA[janela] : 'border-l-linha',
      )}
    >
      <div className="w-20 flex-none sm:w-24">
        {quando ? (
          <>
            <p className={cn('tabular text-2xl leading-tight', janela ? COR_HORA_JANELA[janela] : 'text-tinta')}>
              {formatarHora(quando)}
            </p>
            <p className="mt-0.5 text-xs text-tinta-2">{rotuloDia(quando)}</p>
          </>
        ) : (
          <p className="text-sm text-tinta-2">Sem horário</p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-tinta">Pedido {pedido.codigo}</span>
          {janela && <Badge tom={TOM_JANELA[janela]}>{ROTULO_JANELA[janela]}</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-tinta-2">
          {ROTULO_MODALIDADE[pedido.modalidade]} · <MoneyText centavos={pedido.total_centavos} />
        </p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          variante="secondary"
          className="flex-1 sm:flex-none"
          onClick={() => aoReagendar(pedido)}
          aria-label={`Reagendar pedido ${pedido.codigo}`}
        >
          <CalendarClock strokeWidth={1.75} className="size-4" aria-hidden />
          Reagendar
        </Button>
        <Button
          variante="ghost"
          className="flex-1 sm:flex-none"
          onClick={() => aoLimpar(pedido)}
          aria-label={`Tornar imediato o pedido ${pedido.codigo}`}
        >
          <CalendarX2 strokeWidth={1.75} className="size-4" aria-hidden />
          Tornar imediato
        </Button>
      </div>
    </Card>
  )
}
