// Datas de negocio em America/Sao_Paulo a partir de ISO UTC (o banco guarda UTC).
// Usa Intl (fuso historico da base IANA, inclusive horario de verao ate 2019).
export const FUSO_NEGOCIO = 'America/Sao_Paulo'

function partes(iso: string, opcoes: Intl.DateTimeFormatOptions): Record<string, string> {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new RangeError('data ISO invalida')
  const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_NEGOCIO, hourCycle: 'h23', ...opcoes })
  const out: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value
  return out
}

/** Dia de negocio "YYYY-MM-DD" em Sao Paulo (virada de dia correta, nao a do UTC). */
export function diaSaoPaulo(iso: string): string {
  const p = partes(iso, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${p.year}-${p.month}-${p.day}`
}

/** "dd/MM/yyyy" em Sao Paulo. */
export function formatarData(iso: string): string {
  const p = partes(iso, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${p.day}/${p.month}/${p.year}`
}

/** "HH:mm" em Sao Paulo. */
export function formatarHora(iso: string): string {
  const p = partes(iso, { hour: '2-digit', minute: '2-digit' })
  return `${p.hour}:${p.minute}`
}

/** "dd/MM/yyyy HH:mm" em Sao Paulo. */
export function formatarDataHora(iso: string): string {
  return `${formatarData(iso)} ${formatarHora(iso)}`
}
