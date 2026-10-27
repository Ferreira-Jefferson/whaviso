// Formatacao local do painel. Razao 0..1 -> percentual; `null` = sem base (nunca "0%" falso).
export function percentual(razao: number | null): string {
  if (razao === null) return 'Sem base'
  return `${(razao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** 'YYYY-MM' -> 'mmm/aa' (mes de referencia America/Sao_Paulo; sem conversao de fuso). */
export function mesCurto(mes: string): string {
  const [ano, m] = mes.split('-')
  const nome = MESES[Number(m) - 1] ?? m
  return `${nome}/${(ano ?? '').slice(2)}`
}

/** 'YYYY-MM' -> 'mmm de aaaa'. */
export function mesLongo(mes: string): string {
  const [ano, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? m} de ${ano}`
}
