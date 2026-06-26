// Preço TOTAL (centavos) do Plus por volume de envios: espelho do backend
// (shared/planos.precoPorEnvioCentavos). Interpola o total entre o piso (envios_min)
// e o topo (envios_max) publicados no catálogo; aqui é só exibição (o backend congela
// o valor ao assinar, fonte única). `n` é grampeado na faixa. Em módulo próprio (não
// no .tsx dos cartões) para o react-refresh ficar feliz (só componentes no .tsx).
import type { Plano } from '../contracts'

export function precoEnvioCentavos(p: Plano, n: number): number {
  const lo = p.envios_min ?? 26
  const hi = p.envios_max ?? lo
  const pLo = p.preco_centavos
  const pHi = p.preco_max_centavos ?? pLo
  const nn = Math.min(Math.max(n, lo), hi)
  if (hi === lo) return pLo
  return Math.round(pLo + ((pHi - pLo) * (nn - lo)) / (hi - lo))
}
