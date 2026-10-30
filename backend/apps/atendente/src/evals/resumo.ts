// Agregacao dos resultados de uma execucao em `EvalResumo` (validado antes de gravar). Puro.
import { EvalResumo } from '@whaviso/shared/contracts'
import type { ResultadoCaso } from './tipos'

/** Percentil por interpolacao linear (p em 0..1); null sem dados. */
export function percentil(valores: readonly number[], p: number): number | null {
  if (valores.length === 0) return null
  const v = [...valores].sort((a, b) => a - b)
  const pos = (v.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return v[lo]! + (v[hi]! - v[lo]!) * (pos - lo)
}

const media = (v: readonly number[]): number => v.reduce((s, x) => s + x, 0) / v.length
const arred = (n: number): number => Math.round(n * 10_000) / 10_000

export function montarResumo(resultados: readonly ResultadoCaso[], porMetricaExtra: Record<string, number> = {}): EvalResumo {
  let passou = 0
  let falhou = 0
  let erro = 0
  let tokensIn = 0
  let tokensOut = 0
  let custoCentavos = 0
  let somaPonderada = 0
  let somaPesos = 0
  const porChave = new Map<string, number[]>()
  const latencias: number[] = []

  for (const r of resultados) {
    if (r.status === 'passou') passou++
    else if (r.status === 'falhou') falhou++
    else erro++
    if (r.principal !== null && r.status !== 'erro') {
      somaPonderada += r.principal * r.peso
      somaPesos += r.peso
    }
    for (const [k, v] of Object.entries(r.scores)) {
      const lista = porChave.get(k) ?? []
      lista.push(v)
      porChave.set(k, lista)
    }
    if (r.metricas) {
      tokensIn += r.metricas.tokensIn
      tokensOut += r.metricas.tokensOut
      custoCentavos += r.metricas.custoCentavos
      if (typeof r.metricas.latenciaMs === 'number') latencias.push(r.metricas.latenciaMs)
    }
  }

  const porMetrica: Record<string, number> = {}
  for (const [k, v] of porChave) porMetrica[k] = arred(media(v))
  for (const [k, v] of Object.entries(porMetricaExtra)) porMetrica[k] = arred(v)

  const p50 = percentil(latencias, 0.5)
  const p95 = percentil(latencias, 0.95)
  return EvalResumo.parse({
    total: resultados.length,
    passou,
    falhou,
    erro,
    scoreMedio: somaPesos > 0 ? arred(somaPonderada / somaPesos) : null,
    porMetrica,
    tokensIn,
    tokensOut,
    custoCentavos: Math.round(custoCentavos),
    latenciaP50Ms: p50 === null ? null : Math.round(p50),
    latenciaP95Ms: p95 === null ? null : Math.round(p95),
  })
}
