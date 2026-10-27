// Checklist guiado: barra de progresso + uma linha por etapa (concluida ou com atalho para cumprir).
import { Link } from 'react-router'
import { ArrowRight, Check, Circle } from 'lucide-react'
import { Card, cn } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { OnboardingSaida } from '@/shared/contracts/_generated/onboarding'
import { INFO_ETAPA } from '../estados'

export function ChecklistOnboarding({ dados }: { dados: OnboardingSaida }) {
  // A primeira etapa pendente e o "proximo passo": recebe destaque e o botao primario.
  const proxima = dados.etapas.find((e) => !e.concluida)?.chave

  return (
    <Card className="p-0">
      <div className="border-b border-linha p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg text-salvia">{dados.completo ? 'Tudo pronto' : 'Configure sua loja'}</h2>
          <span className="tabular text-sm text-tinta-2">
            {dados.concluidas} de {dados.total} etapas
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso do onboarding"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={dados.percentual}
          className="mt-3 h-2 overflow-hidden rounded-pill bg-papel-2"
        >
          <div
            className="h-full rounded-pill bg-salvia transition-[width] duration-500"
            style={{ width: `${dados.percentual}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-tinta-2">{dados.percentual}% concluído</p>
      </div>

      <ol className="divide-y divide-linha">
        {dados.etapas.map((etapa, i) => {
          const info = INFO_ETAPA[etapa.chave]
          const destaque = etapa.chave === proxima
          return (
            <li key={etapa.chave} className={cn('flex items-start gap-4 p-5', destaque && 'bg-salvia-claro/40')}>
              <span
                className={cn(
                  'mt-0.5 flex size-7 flex-none items-center justify-center rounded-full border',
                  etapa.concluida ? 'border-folha bg-folha text-papel' : 'border-linha bg-cartao text-tinta-2',
                )}
                aria-hidden
              >
                {etapa.concluida ? (
                  <Check strokeWidth={2.25} className="size-4" />
                ) : (
                  <Circle strokeWidth={1.75} className="size-3" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-tinta">
                  <span className="sr-only">Etapa {i + 1}: </span>
                  {info.titulo}
                  <span className="sr-only">{etapa.concluida ? ' (concluída)' : ' (pendente)'}</span>
                </p>
                <p className="mt-0.5 text-sm text-tinta-2">{info.descricao}</p>
                {etapa.concluida && etapa.concluida_em && (
                  <p className="mt-1 text-xs text-folha">Concluída em {formatarDataHora(etapa.concluida_em)}</p>
                )}
              </div>
              {!etapa.concluida && (
                <Link
                  to={info.destino}
                  className={cn(
                    'inline-flex min-h-11 flex-none items-center gap-1.5 rounded-pill px-4 text-sm font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
                    destaque
                      ? 'bg-salvia text-papel hover:bg-tinta'
                      : 'border border-linha bg-cartao text-tinta hover:bg-papel-2',
                  )}
                >
                  {info.acao}
                  <ArrowRight strokeWidth={1.75} className="size-4" aria-hidden />
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
