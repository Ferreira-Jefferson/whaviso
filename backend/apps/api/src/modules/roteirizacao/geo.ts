// Geometria pura (sem rede): distancia em linha reta e matrizes de fallback. Usada quando o provedor de
// mapas esta fora do ar (resultado sinalizado como `estimado`) e na checagem de area plausivel.
export interface PontoGeo {
  lat: number
  lng: number
}

/** Matrizes quadradas sobre os mesmos nos: [origem][destino]. Tempo em minutos, distancia em metros. */
export interface Matrizes {
  tempoMin: number[][]
  distM: number[][]
  /** true: calculada por linha reta, nao por rota real. */
  estimado: boolean
}

const R_TERRA_M = 6_371_000
/** Fator que converte linha reta em distancia viaria aproximada (malha urbana). */
export const FATOR_VIARIO = 1.3

const rad = (g: number) => (g * Math.PI) / 180

/** Distancia haversine em metros. */
export function haversineM(a: PontoGeo, b: PontoGeo): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Matrizes por linha reta x fator viario, com velocidade media configuravel (km/h). */
export function matrizLinhaReta(pontos: readonly PontoGeo[], velocidadeKmh: number): Matrizes {
  const ms = (velocidadeKmh * 1000) / 3600
  const distM = pontos.map((o) => pontos.map((d) => Math.round(haversineM(o, d) * FATOR_VIARIO)))
  const tempoMin = distM.map((l) => l.map((m) => m / ms / 60))
  return { tempoMin, distM, estimado: true }
}

/** Centroide simples (media de lat/lng): suficiente para a escala de uma cidade. */
export function centroide(pontos: readonly PontoGeo[]): PontoGeo {
  const n = pontos.length || 1
  return {
    lat: pontos.reduce((s, p) => s + p.lat, 0) / n,
    lng: pontos.reduce((s, p) => s + p.lng, 0) / n,
  }
}
