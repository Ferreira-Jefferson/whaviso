// Faixa de resumo do CRM: total de clientes, quantos pediram para nao receber marketing e a
// quebra por segmento. Cada segmento e um filtro clicavel da lista.
import { BellOff, Users } from 'lucide-react'
import { Card, Skeleton, cn } from '@/shared/ui'
import { brl } from '@/shared/format'
import type { CrmResumo, CrmSegmento } from '../api'
import { DICA_SEGMENTO, ROTULO_SEGMENTO, SEGMENTOS, TOM_SEGMENTO, type TomSegmento } from '../segmentos'

interface Props {
  resumo: CrmResumo | undefined
  carregando: boolean
  segmentoAtivo: CrmSegmento | null
  aoEscolher: (segmento: CrmSegmento | null) => void
}

// Ponto de identidade do segmento: espelha a cor do selo (SeloSegmento) para que
// o mesmo segmento seja reconhecido na mesma cor no resumo e na lista.
const COR_PONTO: Record<TomSegmento, string> = {
  neutro: 'bg-cinza-expirado',
  marca: 'bg-salvia',
  sucesso: 'bg-folha',
  atencao: 'bg-ambar',
  erro: 'bg-barro',
}

export function ResumoSegmentos({ resumo, carregando, segmentoAtivo, aoEscolher }: Props) {
  if (carregando) {
    return (
      <div aria-busy="true" aria-label="Carregando resumo" className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-[72px]" />
          <Skeleton className="h-[72px]" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {SEGMENTOS.map((s) => (
            <Skeleton key={s} className="h-[76px]" />
          ))}
        </div>
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
          <span className="flex size-10 flex-none items-center justify-center rounded-pill bg-salvia-claro">
            <Users className="size-5 text-salvia" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-semibold tabular-nums leading-tight text-tinta">{resumo.clientes_total}</p>
            <p className="text-xs text-tinta-2">
              {resumo.clientes_total === 1 ? 'cliente' : 'clientes'} · {contactaveis} podem receber campanha
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex size-10 flex-none items-center justify-center rounded-pill bg-papel-2">
            <BellOff className="size-5 text-tinta-2" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-semibold tabular-nums leading-tight text-tinta">{resumo.opt_out_total}</p>
            <p className="text-xs text-tinta-2">pediram para não receber marketing</p>
          </div>
        </Card>
      </div>

      <div role="group" aria-label="Filtrar por segmento" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {SEGMENTOS.map((seg) => {
          const dado = porSegmento.get(seg)
          const clientes = dado?.clientes ?? 0
          const gasto = dado?.gasto_180d_centavos ?? 0
          const ativo = segmentoAtivo === seg
          const vazio = clientes === 0
          return (
            <button
              key={seg}
              type="button"
              aria-pressed={ativo}
              aria-label={`${ROTULO_SEGMENTO[seg]}: ${clientes} ${clientes === 1 ? 'cliente' : 'clientes'}, ${brl(gasto)} em 180 dias. ${DICA_SEGMENTO[seg]}`}
              title={DICA_SEGMENTO[seg]}
              onClick={() => aoEscolher(ativo ? null : seg)}
              className={cn(
                'flex min-h-11 flex-col items-start gap-1 rounded-card border p-3 text-left transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
                ativo
                  ? 'border-salvia bg-salvia-claro ring-1 ring-salvia'
                  : 'border-linha bg-cartao hover:border-salvia/40 hover:bg-papel-2',
                vazio && !ativo && 'opacity-55',
              )}
            >
              <span className="flex w-full items-center gap-1.5">
                <span className={cn('size-2 flex-none rounded-pill', COR_PONTO[TOM_SEGMENTO[seg]])} aria-hidden />
                <span className="min-w-0 truncate text-xs font-medium text-tinta-2">{ROTULO_SEGMENTO[seg]}</span>
              </span>
              <span className="text-lg font-semibold tabular-nums leading-none text-tinta">{clientes}</span>
              <span className="text-[11px] leading-tight text-tinta-2">
                <span className="tabular-nums">{brl(gasto)}</span> em 180 dias
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
