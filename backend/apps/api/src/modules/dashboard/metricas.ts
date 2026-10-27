// Definicoes de metrica (fonte unica). Puro: divisao por zero devolve null, nunca erro.

/** Ticket medio = faturamento realizado / pedidos entregues (centavos inteiros, arredondado). */
export function ticketMedio(faturamentoRealizado: number, entregues: number): number | null {
  return entregues > 0 ? Math.round(faturamentoRealizado / entregues) : null
}

/** Razao 0..1 ou null quando o denominador e zero. */
export function razao(parte: number, total: number): number | null {
  return total > 0 ? parte / total : null
}

/** Minutos com 1 casa decimal; null se nao ha entrega. */
export function minutos(valor: number | null): number | null {
  return valor === null ? null : Math.round(valor * 10) / 10
}
