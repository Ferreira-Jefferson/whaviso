// Logica pura da comparacao de duas execucoes (B menos A). Sem banco, sem HTTP.
import type { EvalDeltasAgregados, EvalDiffCaso, EvalResumo } from './schemas'

type StatusRes = 'passou' | 'falhou' | 'erro'
export interface ResultadoDiff {
  caso_id: string | null
  status: StatusRes
  scores: Record<string, number>
}

const arred = (n: number): number => Math.round(n * 1e6) / 1e6
const sub = (b: number | null, a: number | null): number | null => (a === null || b === null ? null : arred(b - a))

/** Score medio de um resultado: media dos scores por metrica; null se nao houver nenhum. */
export function scoreDoResultado(scores: Record<string, number>): number | null {
  const v = Object.values(scores)
  return v.length === 0 ? null : v.reduce((s, x) => s + x, 0) / v.length
}

type CampoInt = 'passou' | 'falhou' | 'erro' | 'tokensIn' | 'tokensOut' | 'custoCentavos'

/** Deltas agregados B menos A a partir dos resumos. Lado sem resumo conta como zero nos inteiros. */
export function deltasAgregados(a: EvalResumo | null, b: EvalResumo | null): EvalDeltasAgregados {
  const d = (k: CampoInt): number => (b?.[k] ?? 0) - (a?.[k] ?? 0)
  const porMetrica: Record<string, number> = {}
  for (const k of Object.keys(b?.porMetrica ?? {})) {
    const va = a?.porMetrica[k]
    const vb = b?.porMetrica[k]
    if (va !== undefined && vb !== undefined) porMetrica[k] = arred(vb - va)
  }
  return {
    scoreMedio: sub(b?.scoreMedio ?? null, a?.scoreMedio ?? null),
    passou: d('passou'),
    falhou: d('falhou'),
    erro: d('erro'),
    porMetrica,
    tokensIn: d('tokensIn'),
    tokensOut: d('tokensOut'),
    custoCentavos: d('custoCentavos'),
    latenciaP50Ms: sub(b?.latenciaP50Ms ?? null, a?.latenciaP50Ms ?? null),
    latenciaP95Ms: sub(b?.latenciaP95Ms ?? null, a?.latenciaP95Ms ?? null),
  }
}

/** Diff por caso (resultados sem caso, como o rag_retrieval, nao entram). Ordenado por nome. */
export function diffCasos(
  a: readonly ResultadoDiff[],
  b: readonly ResultadoDiff[],
  nomes: ReadonlyMap<string, string>,
): EvalDiffCaso[] {
  const mapa = (rs: readonly ResultadoDiff[]) =>
    new Map(rs.flatMap((r) => (r.caso_id ? [[r.caso_id, r] as const] : [])))
  const ma = mapa(a)
  const mb = mapa(b)
  const ids = new Set([...ma.keys(), ...mb.keys()])
  const out: EvalDiffCaso[] = []
  for (const id of ids) {
    const ra = ma.get(id)
    const rb = mb.get(id)
    const delta = ra && rb ? sub(scoreDoResultado(rb.scores), scoreDoResultado(ra.scores)) : null
    const statusA = ra?.status ?? null
    const statusB = rb?.status ?? null
    out.push({
      caso_id: id,
      nome: nomes.get(id) ?? id,
      statusA,
      statusB,
      deltaScore: delta,
      mudou: statusA !== statusB || (delta !== null && Math.abs(delta) > 0),
    })
  }
  return out.sort((x, y) => x.nome.localeCompare(y.nome))
}
