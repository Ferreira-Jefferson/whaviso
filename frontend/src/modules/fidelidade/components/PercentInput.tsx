// PercentInput: percentual com virgula na tela e pontos-base (bps, int) no valor.
// 5,00% <-> 500. O estado de texto e local para nao brigar com a digitacao ("5," ainda e valido).
import { useEffect, useState } from 'react'
import { Input } from '@/shared/ui'

interface Props {
  /** Valor em pontos-base (500 = 5%). */
  bps: number
  onChange: (bps: number) => void
  invalido?: boolean
  id?: string
  'aria-describedby'?: string
}

const paraTexto = (bps: number) => (bps / 100).toString().replace('.', ',')

export function PercentInput({ bps, onChange, invalido, id, ...rest }: Props) {
  const [texto, setTexto] = useState(paraTexto(bps))

  // Re-sincroniza quando o valor muda por fora (ex.: carga do programa), sem atropelar a digitacao.
  useEffect(() => {
    setTexto((atual) => (lerBps(atual) === bps ? atual : paraTexto(bps)))
  }, [bps])

  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        value={texto}
        invalido={invalido}
        className="pr-8 tabular"
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d,.]/g, '')
          setTexto(t)
          onChange(lerBps(t))
        }}
        {...rest}
      />
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-tinta-2">
        %
      </span>
    </div>
  )
}

function lerBps(texto: string): number {
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
