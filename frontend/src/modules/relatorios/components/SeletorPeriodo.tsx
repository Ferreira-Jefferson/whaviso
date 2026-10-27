// Seletor de periodo por pilulas (ultimos N dias). Local do modulo.
import { SegmentedControl } from '@/shared/ui'

interface Props {
  dias: number
  onChange: (dias: number) => void
  opcoes: ReadonlyArray<{ dias: number; rotulo: string }>
}

export function SeletorPeriodo({ dias, onChange, opcoes }: Props) {
  return (
    <SegmentedControl
      ariaLabel="Período"
      value={String(dias)}
      onChange={(v) => onChange(Number(v))}
      options={opcoes.map((o) => ({ value: String(o.dias), label: o.rotulo }))}
    />
  )
}
