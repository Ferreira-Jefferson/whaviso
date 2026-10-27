// Cartao de um numero de WhatsApp conectado. Mostra so metadados nao sensiveis (SEC-020):
// identificadores da Meta, status, verificacao e data. O numero em claro e o token NUNCA
// vem no contrato, entao nao ha o que mascarar aqui: o cuidado e nunca exibir mais do que
// o contrato entrega.
import { Pause, Play, RotateCw, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { Badge, Button, Card, cn } from '@/shared/ui'
import { dataHoraPtBR } from '@/shared/format'
import { StatusNumeroBadge } from './StatusNumeroBadge'
import type { NumeroSaida } from '../api'
import type { StatusNumero } from '@/shared/contracts/_generated/enums'

interface CardNumeroProps {
  numero: NumeroSaida
  /** Alguma acao deste numero esta em andamento (desabilita os botoes). */
  ocupado: boolean
  onPausar: () => void
  onReativar: () => void
  onReconectar: () => void
  onRemover: () => void
}

// Tom do avatar por status: reforca o estado de relance, sem depender so do selo.
const AVATAR_POR_STATUS: Record<StatusNumero, string> = {
  conectado: 'bg-salvia-claro text-salvia',
  pausado: 'bg-ambar-claro text-ambar',
  removido: 'bg-papel-2 text-tinta-2',
}

export function CardNumero({ numero, ocupado, onPausar, onReativar, onReconectar, onRemover }: CardNumeroProps) {
  const removido = numero.status === 'removido'

  return (
    <Card className={cn('flex flex-col gap-4', removido && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-10 flex-none items-center justify-center rounded-full',
              AVATAR_POR_STATUS[numero.status],
            )}
          >
            <Smartphone strokeWidth={1.75} className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-tinta">Número de WhatsApp</p>
            <p className="mt-0.5 text-xs text-tinta-2">Conectado em {dataHoraPtBR(numero.criado_em)}</p>
          </div>
        </div>
        <StatusNumeroBadge status={numero.status} />
      </div>

      <dl className="grid gap-2.5 border-t border-linha pt-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex-none text-tinta-2">ID do número</dt>
          <dd className="min-w-0 break-all text-right font-mono text-xs text-tinta">{numero.phone_number_id}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex-none text-tinta-2">Conta (WABA)</dt>
          <dd className="min-w-0 break-all text-right font-mono text-xs text-tinta">{numero.waba_id}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex-none text-tinta-2">Verificação</dt>
          <dd>
            {numero.verificado ? (
              <Badge tom="sucesso" className="gap-1">
                <ShieldCheck strokeWidth={1.75} className="size-3.5" aria-hidden />
                Verificado
              </Badge>
            ) : (
              <Badge tom="atencao">Pendente na Meta</Badge>
            )}
          </dd>
        </div>
      </dl>

      {!removido && (
        <div className="flex flex-col gap-2 border-t border-linha pt-4 sm:flex-row sm:flex-wrap">
          {numero.status === 'conectado' ? (
            <Button variante="secondary" className="w-full sm:w-auto" disabled={ocupado} onClick={onPausar}>
              <Pause strokeWidth={1.75} className="size-4" aria-hidden />
              Pausar
            </Button>
          ) : (
            <Button variante="secondary" className="w-full sm:w-auto" disabled={ocupado} onClick={onReativar}>
              <Play strokeWidth={1.75} className="size-4" aria-hidden />
              Reativar
            </Button>
          )}
          <Button variante="ghost" className="w-full sm:w-auto" disabled={ocupado} onClick={onReconectar}>
            <RotateCw strokeWidth={1.75} className="size-4" aria-hidden />
            Reconectar
          </Button>
          <Button
            variante="ghost"
            className="w-full text-barro hover:bg-barro/10 sm:ml-auto sm:w-auto"
            disabled={ocupado}
            onClick={onRemover}
          >
            <Trash2 strokeWidth={1.75} className="size-4" aria-hidden />
            Remover
          </Button>
        </div>
      )}
    </Card>
  )
}
