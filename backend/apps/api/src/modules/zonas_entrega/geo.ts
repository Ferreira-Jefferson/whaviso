// Geometria pura para zonas (sem I/O). Coordenadas como { lat, lng }; GeoJSON usa [lng, lat].

export interface Ponto {
  lat: number
  lng: number
}

const RAIO_TERRA_M = 6_371_008.8
const rad = (g: number) => (g * Math.PI) / 180

/** Distancia em metros entre dois pontos (haversine). */
export function distanciaMetros(a: Ponto, b: Ponto): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

const EPS = 1e-12

/** true se p esta sobre o segmento a-b (colinear e dentro do retangulo). */
function naAresta(p: Ponto, a: Ponto, b: Ponto): boolean {
  const cruz = (b.lng - a.lng) * (p.lat - a.lat) - (b.lat - a.lat) * (p.lng - a.lng)
  if (Math.abs(cruz) > EPS) return false
  return (
    p.lng >= Math.min(a.lng, b.lng) - EPS &&
    p.lng <= Math.max(a.lng, b.lng) + EPS &&
    p.lat >= Math.min(a.lat, b.lat) - EPS &&
    p.lat <= Math.max(a.lat, b.lat) + EPS
  )
}

/**
 * Ponto em poligono (anel GeoJSON [lng, lat], pode ser concavo). Ponto na aresta ou no vertice
 * conta como dentro. Ray casting (par/impar) para o resto.
 */
export function pontoNoPoligono(p: Ponto, anel: ReadonlyArray<readonly [number, number]>): boolean {
  let dentro = false
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const a: Ponto = { lng: anel[j]![0], lat: anel[j]![1] }
    const b: Ponto = { lng: anel[i]![0], lat: anel[i]![1] }
    if (naAresta(p, a, b)) return true
    if (a.lat > p.lat !== b.lat > p.lat) {
      const xCruza = ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng
      if (p.lng < xCruza) dentro = !dentro
    }
  }
  return dentro
}

/** Ponto dentro (ou na borda) de um raio em metros ao redor do centro. */
export function pontoNoRaio(p: Ponto, centro: Ponto, metros: number): boolean {
  return distanciaMetros(p, centro) <= metros
}

/** Chave de comparacao de bairro: sem acento, minuscula, espacos colapsados. */
export function normalizarBairro(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
