// Geometria do mapa de despacho (puro, sem React nem leaflet): extrai coordenadas das paradas e
// da origem da loja, monta o trajeto de cada corrida e dá uma cor estável por corrida.
//
// COSTURA (seam) para a geocodificação real: hoje o contrato da sugestão (`ParadaSugerida`) NAO
// traz `lat`/`lng` por parada. Outra trilha do backend (`API-roteiriza` + `ClienteMapas`) vai
// devolver coordenada e geometria de rota. Enquanto isso, `pontoDaParada` lê a coordenada de forma
// defensiva: assim que o backend passar a mandar `lat`/`lng` (ou um `ponto`/`coordenada`) na parada,
// os marcadores e o trajeto aparecem sozinhos, sem mexer na UI. Sem coordenada, a parada degrada
// para a lista (nunca some). O trajeto desenhado liga a origem às paradas em ordem por segmentos
// retos; quando a api mandar a geometria real da rota, basta trocar `trajetoDaCorrida` por ela.
import type { CorridaSugerida, DespachoConfigSaida, ParadaSugerida } from '@/shared/contracts/_generated/roteirizacao'

export interface Ponto {
  lat: number
  lng: number
}

/** Centro de fallback (São Paulo capital) quando a loja não tem origem configurada. */
export const CENTRO_PADRAO: Ponto = { lat: -23.55052, lng: -46.633308 }

function coordValida(lat: unknown, lng: unknown): Ponto | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/**
 * Coordenada de uma parada, se e quando o backend a enviar. Lê `lat`/`lng` diretos ou aninhados em
 * `ponto`/`coordenada`, sem acoplar a UI ao formato final: é o ponto de troca para a geocodificação.
 */
export function pontoDaParada(parada: ParadaSugerida): Ponto | null {
  const p = parada as unknown as {
    lat?: unknown
    lng?: unknown
    ponto?: { lat?: unknown; lng?: unknown } | null
    coordenada?: { lat?: unknown; lng?: unknown } | null
  }
  return (
    coordValida(p.lat, p.lng) ??
    coordValida(p.ponto?.lat, p.ponto?.lng) ??
    coordValida(p.coordenada?.lat, p.coordenada?.lng)
  )
}

/** Origem (saída) da loja, da configuração. `null` quando a loja ainda não cadastrou o ponto. */
export function pontoOrigem(config: Pick<DespachoConfigSaida, 'origem_lat' | 'origem_lng'> | undefined): Ponto | null {
  if (!config) return null
  return coordValida(config.origem_lat, config.origem_lng)
}

export interface ParadaComPonto {
  parada: ParadaSugerida
  /** Posição da parada na ordem atual (1 = primeira a visitar). */
  ordem: number
  ponto: Ponto
}

export interface TrajetoCorrida {
  ordemSaida: number
  cor: string
  /** Paradas que já têm coordenada, na ordem de visita. */
  paradas: ParadaComPonto[]
  /** Paradas sem coordenada (ficam só na lista, nunca somem). */
  semPonto: ParadaSugerida[]
  /** Linha do trajeto: origem (se houver) seguida das paradas com coordenada, em ordem. */
  linha: Ponto[]
}

// Paleta on-brand (tokens Calmo Editorial), estável por índice de corrida.
const CORES = ['#1e4d3b', '#b97e22', '#2f6f7a', '#a4543f', '#3e7c5b', '#b8860b', '#5c6b62'] as const

export function corDaCorrida(indice: number): string {
  return CORES[indice % CORES.length] as string
}

/** Paradas de uma corrida já na ordem atual (as com coordenada entram no trajeto; as sem, na lista). */
export function trajetoDaCorrida(corrida: CorridaSugerida, indice: number, origem: Ponto | null): TrajetoCorrida {
  const emOrdem = [...corrida.paradas].sort((a, b) => a.ordem_parada - b.ordem_parada)
  const paradas: ParadaComPonto[] = []
  const semPonto: ParadaSugerida[] = []
  emOrdem.forEach((parada, i) => {
    const ponto = pontoDaParada(parada)
    if (ponto) paradas.push({ parada, ordem: i + 1, ponto })
    else semPonto.push(parada)
  })
  const linha = [...(origem ? [origem] : []), ...paradas.map((p) => p.ponto)]
  return { ordemSaida: corrida.ordem_saida, cor: corDaCorrida(indice), paradas, semPonto, linha }
}

/** Limites que enquadram todos os pontos (origem + paradas). `null` quando não há ponto algum. */
export function limites(pontos: Ponto[]): [Ponto, Ponto] | null {
  if (pontos.length === 0) return null
  let minLat = pontos[0]!.lat
  let maxLat = pontos[0]!.lat
  let minLng = pontos[0]!.lng
  let maxLng = pontos[0]!.lng
  for (const p of pontos) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  return [
    { lat: minLat, lng: minLng },
    { lat: maxLat, lng: maxLng },
  ]
}
