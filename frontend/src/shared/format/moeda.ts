// Dinheiro em centavos (int). Unico ponto de conversao para texto BRL no shell novo.
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Formata centavos inteiros em BRL (ex.: 1999 -> "R$ 19,99"). Rejeita nao inteiros. */
export function formatarCentavos(centavos: number): string {
  if (!Number.isInteger(centavos)) {
    throw new RangeError('formatarCentavos exige centavos inteiros')
  }
  // Intl usa espaco nao separavel entre o simbolo e o valor; normalizamos para espaco comum.
  return BRL.format(centavos / 100).replace(/ /g, ' ')
}
