// Uma linha da agenda: horario em destaque, codigo/modalidade/total e as acoes de reagendar e limpar.
import { CalendarClock, CalendarX2 } from 'lucide-react'
import { Badge, Button, Card, MoneyText } from '@/shared/ui'
import { formatarData, formatarHora } from '@/shared/format'
import type { AgendamentoDto } from '@/shared/contracts/_generated/agendamento'
import { ROTULO_JANELA, ROTULO_MODALIDADE, TOM_JANELA } from '../estados'

interface Props {
  pedido: AgendamentoDto
  aoReagendar: (p: AgendamentoDto) => void
  aoLimpar: (p: AgendamentoDto) => void
}

export function LinhaAgenda({ pedido, aoReagendar, aoLimpar }: Props) {
  const quando = pedido.agendado_para
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
      <div className="w-24 flex-none">
        {quando ? (
          <>
            <p className="tabular text-xl text-salvia">{formatarHora(quando)}</p>
            <p className="text-xs text-tinta-2">{formatarData(quando)}</p>
          </>
        ) : (
          <p className="text-sm text-tinta-2">Sem horário</p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-tinta">Pedido {pedido.codigo}</span>
          {pedido.janela && <Badge tom={TOM_JANELA[pedido.janela]}>{ROTULO_JANELA[pedido.janela]}</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-tinta-2">
          {ROTULO_MODALIDADE[pedido.modalidade]} · <MoneyText centavos={pedido.total_centavos} />
        </p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button variante="secondary" className="flex-1 sm:flex-none" onClick={() => aoReagendar(pedido)}>
          <CalendarClock strokeWidth={1.75} className="size-4" aria-hidden />
          Reagendar
        </Button>
        <Button variante="ghost" className="flex-1 sm:flex-none" onClick={() => aoLimpar(pedido)}>
          <CalendarX2 strokeWidth={1.75} className="size-4" aria-hidden />
          Tornar imediato
        </Button>
      </div>
    </Card>
  )
}
