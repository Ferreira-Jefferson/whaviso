// Matriz de tempos/distancias: UMA chamada `ClienteMapas.matriz` (loja + paradas) e, se o provedor falha
// ou devolve algo inconsistente, fallback por linha reta sinalizado como `estimado`.
// Toda saida de rede passa pela interface (host allowlist/SSRF vivem na implementacao em shared/clientes).
import type { ClienteMapas } from '@whaviso/shared/clientes'
import { matrizLinhaReta, type Matrizes, type PontoGeo } from './geo'

const formaValida = (m: number[][] | undefined, n: number): m is number[][] =>
  Array.isArray(m) &&
  m.length === n &&
  m.every((l) => Array.isArray(l) && l.length === n && l.every((v) => Number.isFinite(v) && v >= 0))

export async function obterMatrizes(
  mapas: ClienteMapas, pontos: readonly PontoGeo[], velocidadeKmh: number,
): Promise<Matrizes> {
  const n = pontos.length
  try {
    const r = await mapas.matriz([...pontos], [...pontos])
    if (r.ok && formaValida(r.valor.distanciasM, n) && formaValida(r.valor.duracoesS, n)) {
      return {
        tempoMin: r.valor.duracoesS.map((l) => l.map((s) => s / 60)),
        distM: r.valor.distanciasM.map((l) => l.map((m) => Math.round(m))),
        estimado: false,
      }
    }
  } catch {
    // provedor quebrou de forma inesperada: cai no fallback (sem logar: sem dado de endereco).
  }
  return matrizLinhaReta(pontos, velocidadeKmh)
}
