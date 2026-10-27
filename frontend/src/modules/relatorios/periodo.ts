// Periodos pre-definidos em dias de negocio America/Sao_Paulo (YYYY-MM-DD, `ate` inclusivo).
// A aritmetica aqui e so de calendario; o corte de dia e a agregacao sao do servidor.
import { hojeIso } from '@/shared/format'

export interface Periodo {
  de: string
  ate: string
}

/** Soma `n` dias (pode ser negativo) a uma data de negocio 'YYYY-MM-DD'. */
export function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Ultimos `dias` dias terminando hoje (inclusive), em Sao Paulo. */
export function periodoDosUltimosDias(dias: number): Periodo {
  const ate = hojeIso()
  return { de: somarDias(ate, -(dias - 1)), ate }
}

/** 'YYYY-MM-DD' -> 'dd/MM'. */
export function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** Todos os dias de `de` a `ate` (inclusivos), para preencher dias sem registro. */
export function diasDoPeriodo(p: Periodo): string[] {
  const dias: string[] = []
  for (let d = p.de; d <= p.ate && dias.length < 400; d = somarDias(d, 1)) dias.push(d)
  return dias
}
