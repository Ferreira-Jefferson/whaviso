// Checklist guiado: cabecalho com progresso + uma linha por etapa (concluida, atual ou futura).
import { Link } from 'react-router'
import { ArrowRight, Check } from 'lucide-react'
import { Card, cn } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { OnboardingSaida } from '@/shared/contracts/_generated/onboarding'
import { INFO_ETAPA } from '../estados'

export function ChecklistOnboarding({ dados }: { dados: OnboardingSaida }) {
  // A primeira etapa pendente e o "proximo passo": recebe destaque e o botao primario.
  const proxima = dados.etapas.find((e) => !e.concluida)?.chave
  const restantes = dados.total - dados.concluidas

  const titulo = dados.completo ? 'Tudo pronto' : 'Configure sua loja'
  const subtitulo = dados.completo
    ? 'Sua loja está no ar e os pedidos agora chegam direto para você.'
    : dados.concluidas === 0
      ? `${dados.total} passos rápidos e sua loja começa a receber pedidos.`
      : `Falta${restantes === 1 ? '' : 'm'} ${restantes} ${restantes === 1 ? 'passo' : 'passos'} para sua loja receber pedidos.`

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-linha p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl text-salvia">{titulo}</h2>
            <p className="mt-1 text-sm text-tinta-2">{subtitulo}</p>
          </div>
          <div className="flex flex-none items-baseline gap-0.5">
            <span className={cn('font-display text-3xl leading-none tabular', dados.completo ? 'text-folha' : 'text-salvia')}>
              {dados.percentual}
            </span>
            <span className="text-sm text-tinta-2">%</span>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso do onboarding"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={dados.percentual}
          className="mt-4 h-2.5 overflow-hidden rounded-pill bg-papel-2"
        >
          <div
            className={cn('h-full rounded-pill transition-[width] duration-500', dados.completo ? 'bg-folha' : 'bg-salvia')}
            style={{ width: `${dados.percentual}%` }}
          />
        </div>
        <p className="tabular mt-2 text-xs text-tinta-2">
          {dados.concluidas} de {dados.total} etapas concluídas
        </p>
      </div>

      <ol>
        {dados.etapas.map((etapa, i) => {
          const info = INFO_ETAPA[etapa.chave]
          const destaque = etapa.chave === proxima
          const estado = etapa.concluida ? 'feita' : destaque ? 'ativa' : 'futura'
          return (
            <li
              key={etapa.chave}
              className={cn(
                'relative flex items-start gap-4 border-t border-linha p-5 first:border-t-0',
                destaque && 'bg-salvia-claro/50',
              )}
            >
              {destaque && <span className="absolute inset-y-0 left-0 w-1 bg-salvia" aria-hidden />}
              <span
                className={cn(
                  'mt-0.5 flex size-7 flex-none items-center justify-center rounded-full border',
                  estado === 'feita' && 'border-folha bg-folha text-papel',
                  estado === 'ativa' && 'border-salvia bg-salvia text-papel',
                  estado === 'futura' && 'border-linha bg-cartao text-tinta-2',
                )}
                aria-hidden
              >
                {etapa.concluida ? (
                  <Check strokeWidth={2.25} className="size-4" />
                ) : (
                  <span className="tabular text-xs font-bold">{i + 1}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                {destaque && (
                  <p className="text-[0.7rem] font-bold uppercase tracking-wide text-salvia">Próximo passo</p>
                )}
                <p className="text-sm font-medium text-tinta">
                  <span className="sr-only">Etapa {i + 1}: </span>
                  {info.titulo}
                  <span className="sr-only">{etapa.concluida ? ' (concluída)' : ' (pendente)'}</span>
                </p>
                <p className="mt-0.5 text-sm text-tinta-2">{info.descricao}</p>
                {etapa.concluida && etapa.concluida_em && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-folha">
                    <Check strokeWidth={2.25} className="size-3.5 flex-none" aria-hidden />
                    Concluída em {formatarDataHora(etapa.concluida_em)}
                  </p>
                )}
              </div>
              {!etapa.concluida && (
                <Link
                  to={info.destino}
                  className={cn(
                    'inline-flex min-h-11 flex-none items-center gap-1.5 self-center rounded-pill px-4 text-sm font-medium transition-colors',
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
