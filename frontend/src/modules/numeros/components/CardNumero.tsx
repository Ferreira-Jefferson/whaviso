// Cartao de um numero de WhatsApp conectado. Mostra so metadados nao sensiveis (SEC-020):
// identificadores da Meta, status, verificacao e data. O numero em claro e o token NUNCA
// vem no contrato, entao nao ha o que mascarar aqui: o cuidado e nunca exibir mais do que
// o contrato entrega.
import { Pause, Play, RotateCw, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { Button, Card } from '@/shared/ui'
import { dataHoraPtBR } from '@/shared/format'
import { StatusNumeroBadge } from './StatusNumeroBadge'
import type { NumeroSaida } from '../api'

interface CardNumeroProps {
  numero: NumeroSaida
  /** Alguma acao deste numero esta em andamento (desabilita os botoes). */
  ocupado: boolean
  onPausar: () => void
  onReativar: () => void
  onReconectar: () => void
  onRemover: () => void
}

export function CardNumero({ numero, ocupado, onPausar, onReativar, onReconectar, onRemover }: CardNumeroProps) {
  const removido = numero.status === 'removido'

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 flex size-10 flex-none items-center justify-center rounded-full bg-salvia-claro text-salvia">
            <Smartphone strokeWidth={1.75} className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="break-all font-mono text-sm text-tinta">{numero.phone_number_id}</p>
            <p className="mt-0.5 text-xs text-tinta-2">
              Conectado em {dataHoraPtBR(numero.criado_em)}
            </p>
          </div>
        </div>
        <StatusNumeroBadge status={numero.status} />
      </div>

      <dl className="grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-tinta-2">Conta (WABA)</dt>
          <dd className="break-all text-right font-mono text-xs text-tinta">{numero.waba_id}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-tinta-2">Verificação</dt>
          <dd>
            {numero.verificado ? (
              <span className="inline-flex items-center gap-1 text-folha">
                <ShieldCheck strokeWidth={1.75} className="size-4" aria-hidden />
                Verificado
              </span>
            ) : (
              <span className="text-tinta-2">Pendente na Meta</span>
            )}
          </dd>
        </div>
      </dl>

      {!removido && (
        <div className="flex flex-wrap gap-2 border-t border-linha pt-4">
          {numero.status === 'conectado' ? (
            <Button variante="secondary" disabled={ocupado} onClick={onPausar}>
              <Pause strokeWidth={1.75} className="size-4" aria-hidden />
              Pausar
            </Button>
          ) : (
            <Button variante="secondary" disabled={ocupado} onClick={onReativar}>
              <Play strokeWidth={1.75} className="size-4" aria-hidden />
              Reativar
            </Button>
          )}
          <Button variante="ghost" disabled={ocupado} onClick={onReconectar}>
            <RotateCw strokeWidth={1.75} className="size-4" aria-hidden />
            Reconectar
          </Button>
          <Button variante="ghost" className="text-barro hover:bg-barro/10" disabled={ocupado} onClick={onRemover}>
            <Trash2 strokeWidth={1.75} className="size-4" aria-hidden />
            Remover
          </Button>
        </div>
      )}
    </Card>
  )
}
