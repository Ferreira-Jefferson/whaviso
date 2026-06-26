// Preço TOTAL (centavos) de uma compra de N envios pela curva de MARCOS: espelho do
// backend (shared/planos.precoPorEnvioCentavos). A curva é uma tabela de marcos
// {envios, centavos} (centavos = R$/envio); o R$/envio entre dois marcos é interpolado
// linearmente (passando exatamente pelos valores da tabela nos marcos) e o total é
// round(n * R$/envio(n)). Fora da faixa, `n` é grampeado ao primeiro/último marco. Fonte
// única do preço (front e back idênticos). Em módulo próprio (não no .tsx) p/ o react-refresh.
import type { CreditosCatalogo } from '../contracts'

export function precoEnvioCentavos(catalogo: CreditosCatalogo, n: number): number {
  const pts = catalogo.curva
  const lo = pts[0]
  const hi = pts[pts.length - 1]
  if (!lo || !hi) return 0
  const nn = Math.min(Math.max(n, lo.envios), hi.envios)
  let porEnvio = hi.centavos
  if (nn <= lo.envios) {
    porEnvio = lo.centavos
  } else {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      if (!a || !b) continue
      if (nn >= a.envios && nn <= b.envios) {
        porEnvio =
          b.envios === a.envios
            ? a.centavos
            : a.centavos + ((b.centavos - a.centavos) * (nn - a.envios)) / (b.envios - a.envios)
        break
      }
    }
  }
  return Math.round(nn * porEnvio)
}
