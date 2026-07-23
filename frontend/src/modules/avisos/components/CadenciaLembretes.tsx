// "Quais lembretes enviar" (E6 H6.10): a CADÊNCIA é propriedade do PRÓPRIO combinado,
// não da repetição. Vale para o combinado simples e, quando há recorrência, para cada
// ocorrência (mesmo subconjunto em todas). Por isso vive no formulário do aviso, ao lado
// (não dentro) do "Repetir este combinado".
//
// E11 H11.2: cadência é UNIVERSAL (liberada para todos, sem gating por plano). Sem
// configurar nada = ciclo completo D-2..D+1 (H6.2). O servidor é a autoridade: filtra as
// etapas no cálculo dos agendamentos.
import { useEffect, useMemo, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/shared/ui'
import type { EtapaEnvio } from '@/shared/contracts'

// As 4 etapas do ciclo, na ordem em que saem (E6 H6.2). Rótulo curto (chip).
const ETAPAS: ReadonlyArray<{ value: EtapaEnvio; rotulo: string; quando: string }> = [
  { value: 'd_menos_2', rotulo: 'D-2', quando: '2 dias antes' },
  { value: 'd_menos_1', rotulo: 'D-1', quando: '1 dia antes' },
  { value: 'd', rotulo: 'D', quando: 'no dia' },
  { value: 'd_mais_1', rotulo: 'D+1', quando: '1 dia depois' },
]

interface CadenciaLembretesProps {
  /** Emite o subconjunto escolhido (undefined = ciclo completo) sempre que muda. */
  onChange: (etapas: EtapaEnvio[] | undefined) => void
  /**
   * Se o combinado já tem uma chave Pix definida. Os lembretes pelo WhatsApp exigem
   * Pix; em fluxos onde a chave é opcional (agenda, pagar), sem ela o seletor fica
   * visualmente indisponível (opacidade + texto explicativo), sem bloquear o resto
   * do formulário.
   */
  pixPresente: boolean
}

export function CadenciaLembretes({ onChange, pixPresente }: CadenciaLembretesProps) {
  // Subconjunto das etapas. Vazio = todas marcadas (ciclo completo).
  const [etapasSelecionadas, setEtapasSelecionadas] = useState<EtapaEnvio[]>([])

  // Só conta como configurada quando há subconjunto válido (1..3 etapas; 4 = ciclo
  // completo, equivalente a não configurar).
  const cadenciaEtapas = useMemo<EtapaEnvio[] | undefined>(() => {
    if (etapasSelecionadas.length === 0 || etapasSelecionadas.length === ETAPAS.length) {
      return undefined
    }
    // Mantém na ordem canônica do ciclo.
    return ETAPAS.map((e) => e.value).filter((v) => etapasSelecionadas.includes(v))
  }, [etapasSelecionadas])

  // Avisa o pai a cada mudança efetiva.
  useEffect(() => {
    onChange(cadenciaEtapas)
    // onChange é estável (useCallback no pai); só reagimos ao valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadenciaEtapas])

  // Texto-resumo reflete a seleção atual, em vez de afirmar sempre os 4 (evita
  // induzir ao erro quando o usuário desmarca chips). Vazio = ciclo completo.
  const resumo = useMemo(() => {
    const ativas =
      etapasSelecionadas.length === 0
        ? ETAPAS
        : ETAPAS.filter((e) => etapasSelecionadas.includes(e.value))
    if (ativas.length === ETAPAS.length) {
      return 'Saem os 4 lembretes (D-2 a D+1).'
    }
    const rotulos = ativas.map((e) => e.rotulo)
    if (ativas.length === 1) {
      return `Sai só o lembrete ${ativas[0]!.rotulo} (${ativas[0]!.quando}).`
    }
    const lista = `${rotulos.slice(0, -1).join(', ')} e ${rotulos[rotulos.length - 1]}`
    return `Saem ${ativas.length} lembretes: ${lista}.`
  }, [etapasSelecionadas])

  function alternarEtapa(etapa: EtapaEnvio) {
    setEtapasSelecionadas((atual) =>
      atual.includes(etapa) ? atual.filter((e) => e !== etapa) : [...atual, etapa],
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', !pixPresente && 'opacity-50')}>
      <span className="flex items-center gap-1.5 text-sm font-medium text-tinta">
        <CalendarRange strokeWidth={1.75} className="size-4 text-salvia" />
        Quais lembretes enviar
      </span>
      <p className="text-xs text-tinta-2">
        {pixPresente
          ? resumo
          : 'Só é possível enviar lembretes pelo WhatsApp em combinados com chave Pix cadastrada.'}
      </p>
      <div className={cn('flex flex-wrap gap-2 pt-1', !pixPresente && 'pointer-events-none')}>
        {ETAPAS.map((etapa) => {
          const ativo =
            etapasSelecionadas.length === 0 || etapasSelecionadas.includes(etapa.value)
          return (
            <button
              key={etapa.value}
              type="button"
              role="checkbox"
              aria-checked={ativo}
              aria-disabled={!pixPresente}
              tabIndex={pixPresente ? 0 : -1}
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
    </div>
  )
}
