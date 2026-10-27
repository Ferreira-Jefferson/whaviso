// Faixa de resumo do CRM: total de clientes, quantos pediram para nao receber marketing e a
// quebra por segmento. Cada segmento e um filtro clicavel da lista.
import { BellOff, Users } from 'lucide-react'
import { Card, Skeleton, cn } from '@/shared/ui'
import { brl } from '@/shared/format'
import type { CrmResumo, CrmSegmento } from '../api'
import { DICA_SEGMENTO, ROTULO_SEGMENTO, SEGMENTOS } from '../segmentos'

interface Props {
  resumo: CrmResumo | undefined
  carregando: boolean
  segmentoAtivo: CrmSegmento | null
  aoEscolher: (segmento: CrmSegmento | null) => void
}

export function ResumoSegmentos({ resumo, carregando, segmentoAtivo, aoEscolher }: Props) {
  if (carregando) {
    return (
      <div aria-busy="true" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }
  if (!resumo) return null

  const porSegmento = new Map(resumo.segmentos.map((s) => [s.segmento, s]))
  const contactaveis = Math.max(resumo.clientes_total - resumo.opt_out_total, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3">
          <Users className="size-6 flex-none text-salvia" aria-hidden />
          <div>
            <p className="text-2xl font-semibold tabular-nums text-tinta">{resumo.clientes_total}</p>
            <p className="text-xs text-tinta-2">Clientes ({contactaveis} podem receber campanha)</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <BellOff className="size-6 flex-none text-tinta-2" aria-hidden />
          <div>
            <p className="text-2xl font-semibold tabular-nums text-tinta">{resumo.opt_out_total}</p>
            <p className="text-xs text-tinta-2">Pediram para não receber marketing</p>
          </div>
        </Card>
      </div>

      <div role="group" aria-label="Filtrar por segmento" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {SEGMENTOS.map((seg) => {
          const dado = porSegmento.get(seg)
          const ativo = segmentoAtivo === seg
          return (
            <button
              key={seg}
              type="button"
              aria-pressed={ativo}
              title={DICA_SEGMENTO[seg]}
              onClick={() => aoEscolher(ativo ? null : seg)}
              className={cn(
                'flex min-h-11 flex-col items-start gap-0.5 rounded-card border p-3 text-left transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
                ativo ? 'border-salvia bg-salvia-claro' : 'border-linha bg-cartao hover:bg-papel-2',
              )}
            >
              <span className="text-xs text-tinta-2">{ROTULO_SEGMENTO[seg]}</span>
              <span className="text-lg font-semibold tabular-nums text-tinta">{dado?.clientes ?? 0}</span>
              <span className="text-[11px] text-tinta-2">{brl(dado?.gasto_180d_centavos ?? 0)} em 180 dias</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
