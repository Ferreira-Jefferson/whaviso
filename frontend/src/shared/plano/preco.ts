// Preço TOTAL (centavos) de uma compra de N envios: espelho do backend
// (shared/planos.precoPorEnvioCentavos). Interpola o total entre o piso (envios_min ->
// preco_centavos) e o topo (envios_max -> preco_max_centavos) da curva do catálogo; o
// R$/envio cai conforme o volume sobe. Fonte única do preço (front e back idênticos). `n`
// é grampeado na faixa. Em módulo próprio (não no .tsx) para o react-refresh ficar feliz.
import type { CreditosCatalogo } from '../contracts'

export function precoEnvioCentavos(curva: CreditosCatalogo, n: number): number {
  const lo = curva.envios_min
  const hi = curva.envios_max
  const pLo = curva.preco_centavos
  const pHi = curva.preco_max_centavos
  const nn = Math.min(Math.max(n, lo), hi)
  if (hi === lo) return pLo
  return Math.round(pLo + ((pHi - pLo) * (nn - lo)) / (hi - lo))
}
