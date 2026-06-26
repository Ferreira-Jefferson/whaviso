// "Quais lembretes enviar" (E6 H6.10): a CADÊNCIA é propriedade do PRÓPRIO combinado,
// não da repetição. Vale para o combinado simples e, quando há recorrência, para cada
// ocorrência (mesmo subconjunto em todas). Por isso vive no formulário do aviso, ao lado
// (não dentro) do "Repetir este combinado".
//
// É recurso PAGO: o seletor só habilita com `cadencia_configuravel`; senão fica bloqueado
// com CTA "Ver planos" (não some). Sem configurar nada = ciclo completo D-2..D+1 (H6.2).
// O servidor é a autoridade: filtra as etapas no cálculo dos agendamentos.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarRange, Lock } from 'lucide-react'
import { Banner, cn } from '@/shared/ui'
import type { EtapaEnvio } from '@/shared/contracts'

// As 4 etapas do ciclo, na ordem em que saem (E6 H6.2). Rótulo curto (chip).
const ETAPAS: ReadonlyArray<{ value: EtapaEnvio; rotulo: string; quando: string }> = [
  { value: 'd_menos_2', rotulo: 'D-2', quando: '2 dias antes' },
  { value: 'd_menos_1', rotulo: 'D-1', quando: '1 dia antes' },
  { value: 'd', rotulo: 'D', quando: 'no dia' },
  { value: 'd_mais_1', rotulo: 'D+1', quando: '1 dia depois' },
]

interface CadenciaLembretesProps {
  /** Cadência configurável liberada pelo plano vigente (recurso PAGO). */
  cadenciaConfiguravel: boolean
  /** Emite o subconjunto escolhido (undefined = ciclo completo) sempre que muda. */
  onChange: (etapas: EtapaEnvio[] | undefined) => void
}

export function CadenciaLembretes({ cadenciaConfiguravel, onChange }: CadenciaLembretesProps) {
  // Subconjunto das etapas. Vazio = todas marcadas (ciclo completo).
  const [etapasSelecionadas, setEtapasSelecionadas] = useState<EtapaEnvio[]>([])

  // Só conta como configurada quando o plano permite E há subconjunto válido
  // (1..3 etapas; 4 = ciclo completo, equivalente a não configurar).
  const cadenciaEtapas = useMemo<EtapaEnvio[] | undefined>(() => {
    if (!cadenciaConfiguravel) return undefined
    if (etapasSelecionadas.length === 0 || etapasSelecionadas.length === ETAPAS.length) {
      return undefined
    }
    // Mantém na ordem canônica do ciclo.
    return ETAPAS.map((e) => e.value).filter((v) => etapasSelecionadas.includes(v))
  }, [cadenciaConfiguravel, etapasSelecionadas])

  // Avisa o pai a cada mudança efetiva.
  useEffect(() => {
    onChange(cadenciaEtapas)
    // onChange é estável (useCallback no pai); só reagimos ao valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadenciaEtapas])

  function alternarEtapa(etapa: EtapaEnvio) {
    setEtapasSelecionadas((atual) =>
      atual.includes(etapa) ? atual.filter((e) => e !== etapa) : [...atual, etapa],
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-sm font-medium text-tinta">
        <CalendarRange strokeWidth={1.75} className="size-4 text-salvia" />
        Quais lembretes enviar
      </span>
      {cadenciaConfiguravel ? (
        <>
          <p className="text-xs text-tinta-2">
            Por padrão saem os 4 lembretes (D-2 a D+1).
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {ETAPAS.map((etapa) => {
              const ativo =
                etapasSelecionadas.length === 0 || etapasSelecionadas.includes(etapa.value)
              return (
                <button
                  key={etapa.value}
                  type="button"
                  role="checkbox"
                  aria-checked={ativo}
                  onClick={() => alternarEtapa(etapa.value)}
                  className={cn(
                    'flex flex-col items-center rounded-input border px-3 py-2 text-center transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
                    ativo
                      ? 'border-salvia bg-salvia-claro text-salvia'
                      : 'border-linha bg-cartao text-tinta-2 hover:text-tinta',
                  )}
                >
                  <span className="text-sm font-medium">{etapa.rotulo}</span>
                  <span className="text-[11px]">{etapa.quando}</span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <Banner tom="info">
          <span className="flex items-start gap-2">
            <Lock strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
            <span>
              Escolher quais lembretes saem é um recurso dos planos pagos. No seu plano,
              saem os 4 (D-2 a D+1).{' '}
              <Link to="/app/plano" className="font-medium underline">
                Ver planos
              </Link>
            </span>
          </span>
        </Banner>
      )}
    </div>
  )
}
