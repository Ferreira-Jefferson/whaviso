// Definicoes de metrica do painel (fonte unica, funcoes puras, sem I/O). Recebem linhas agregadas
// do banco e devolvem numeros prontos. Divisao por zero devolve `null`, nunca 0.

/** num/den em fracao 0..1 (limitada); `null` se nao ha base. */
export function razao(num: number, den: number): number | null {
  if (den <= 0) return null
  return Math.min(1, Math.max(0, num / den))
}

/** ARPA = MRR / contas com assinatura ativa, em centavos inteiros; `null` sem contas ativas. */
export function arpa(mrrCentavos: number, contasAtivas: number): number | null {
  if (contasAtivas <= 0) return null
  return Math.round(mrrCentavos / contasAtivas)
}

/** Churn de contas = cancelamentos do mes / ativas no primeiro dia do mes. */
export const churnContas = razao
/** Churn de MRR = MRR cancelado no mes / MRR ativo no primeiro dia do mes. */
export const churnMrr = razao
/** Conversao do funil = prospectos que viraram ativos / prospectos do periodo. */
export const conversaoFunil = razao
/** Conversao de trial = trials encerrados no mes que viraram assinatura paga / trials encerrados. */
export const conversaoTrial = razao

/** `YYYY-MM` de um ano/mes (mes 1..12). */
export function rotuloMes(ano: number, mes: number): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`
}

/** Recua `n` meses a partir de (ano, mes); lida com a virada de ano. */
export function recuarMeses(ano: number, mes: number, n: number): { ano: number; mes: number } {
  const total = ano * 12 + (mes - 1) - n
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 }
}
