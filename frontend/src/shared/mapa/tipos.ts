// Tipos e helpers puros do seletor de area de entrega (sem React nem leaflet). Ficam separados do
// renderizador (chunk pesado do leaflet) para serem importados barato e cobertos por teste em jsdom.
// Convencao de coordenada: PontoMapa usa { lat, lng } (como o leaflet). O anel do poligono usa a
// ordem do GeoJSON: [lng, lat]. Dinheiro/medidas inteiras ficam em metros (o raio do circulo e em
// metros, igual ao radius do L.circle).

/** Um ponto no mapa, na ordem do leaflet (latitude, longitude). */
export interface PontoMapa {
  lat: number
  lng: number
}

/**
 * Area de entrega desenhada no mapa. Duas formas:
 *  - raio: um circulo (centro + raio em metros).
 *  - poligono: um anel GeoJSON FECHADO (primeiro ponto = ultimo ponto, no minimo 4 posicoes, ou
 *    seja 3 vertices distintos mais o fechamento), cada posicao na ordem [lng, lat].
 */
export type AreaGeo =
  | { tipo: 'raio'; centro: PontoMapa; metros: number }
  | { tipo: 'poligono'; anel: Array<[number, number]> }

/** Centro de fallback (Sao Paulo capital) quando nao ha loja nem area para centrar o mapa. */
export const CENTRO_PADRAO: PontoMapa = { lat: -23.55052, lng: -46.633308 }

export function kmParaMetros(km: number): number {
  return km * 1000
}

export function metrosParaKm(metros: number): number {
  return metros / 1000
}

// Tolerancia para considerar dois pontos o mesmo (evita vertice duplicado por clique repetido).
const EPS = 1e-9

function mesmoPonto(a: PontoMapa, b: PontoMapa): boolean {
  return Math.abs(a.lat - b.lat) < EPS && Math.abs(a.lng - b.lng) < EPS
}

/** Remove vertices repetidos (consecutivos ou nao), preservando a ordem de clique. */
export function verticesDistintos(vertices: readonly PontoMapa[]): PontoMapa[] {
  const out: PontoMapa[] = []
  for (const v of vertices) {
    if (!out.some((p) => mesmoPonto(p, v))) out.push(v)
  }
  return out
}

/**
 * Monta o anel GeoJSON fechado a partir dos vertices desenhados (lat/lng na ordem de clique).
 * Devolve null quando ha menos de 3 vertices distintos (nao da para formar area). O anel sai na
 * ordem [lng, lat] com o primeiro ponto repetido no fim (fechado, >= 4 posicoes).
 */
export function montarAnelFechado(vertices: readonly PontoMapa[]): Array<[number, number]> | null {
  const distintos = verticesDistintos(vertices)
  if (distintos.length < 3) return null
  const anel: Array<[number, number]> = distintos.map((p) => [p.lng, p.lat])
  anel.push(anel[0]!) // fecha o anel
  return anel
}

/** Vertices (lat/lng, na ordem de desenho) a partir de um anel GeoJSON fechado, sem o fechamento. */
export function anelParaVertices(anel: ReadonlyArray<readonly [number, number]>): PontoMapa[] {
  const pts: PontoMapa[] = anel.map(([lng, lat]) => ({ lat, lng }))
  if (pts.length > 1 && mesmoPonto(pts[0]!, pts[pts.length - 1]!)) pts.pop()
  return pts
}
