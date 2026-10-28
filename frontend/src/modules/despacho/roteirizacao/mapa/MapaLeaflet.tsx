// Renderizador do mapa de despacho (chunk pesado: só entra quando o mapa aparece, via import()
// dinâmico no MapaDespacho). Imperativo sobre o leaflet: tiles base, marcador da loja (origem),
// paradas numeradas por corrida e o trajeto (segmentos retos entre as paradas em ordem). Nenhuma
// chamada a provedor de dados sai daqui (SEC-070): só os tiles do host configurado. A conversão de
// coordenada e o agrupamento vêm prontos de geo.ts; aqui é só desenho e interação.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Ponto, TrajetoCorrida } from './geo'
import { CENTRO_PADRAO, limites } from './geo'

// Host de tiles: OpenStreetMap (livre). Registrar no CSP do servidor (img-src) com os subdomínios
// a/b/c de tile.openstreetmap.org (SEC-090). Trocar de provedor é mudar só esta constante.
const TILES_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILES_ATRIB = '&copy; OpenStreetMap'

interface Props {
  origem: Ponto | null
  trajetos: TrajetoCorrida[]
  /** `ordem_saida` da corrida em destaque (hover ou seleção), ou null. */
  ativa: number | null
  onAtiva: (ordemSaida: number | null) => void
}

function iconeLoja(): L.DivIcon {
  const html =
    '<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;' +
    'border-radius:9999px;background:#20322a;color:#faf7f0;box-shadow:0 1px 4px rgba(0,0,0,.35)">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 4 4h16l1 5"/><path d="M4 9v11h16V9"/>' +
    '<path d="M9 20v-6h6v6"/></svg></span>'
  return L.divIcon({ html, className: 'whv-mapa-loja', iconSize: [30, 30], iconAnchor: [15, 15] })
}

function iconeParada(numero: number, cor: string, destaque: boolean): L.DivIcon {
  const tam = destaque ? 28 : 24
  const op = destaque ? '1' : '0.9'
  const html =
    `<span style="display:flex;align-items:center;justify-content:center;width:${tam}px;height:${tam}px;` +
    `border-radius:9999px;background:${cor};color:#fff;opacity:${op};font:700 12px/1 Karla,system-ui,sans-serif;` +
    `border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">${numero}</span>`
  return L.divIcon({ html, className: 'whv-mapa-parada', iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] })
}

export default function MapaLeaflet({ origem, trajetos, ativa, onAtiva }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const camadaRef = useRef<L.LayerGroup | null>(null)
  // Guarda os callbacks mais recentes sem recriar o mapa.
  const onAtivaRef = useRef(onAtiva)
  onAtivaRef.current = onAtiva

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true, preferCanvas: false })
    L.tileLayer(TILES_URL, { maxZoom: 19, attribution: TILES_ATRIB }).addTo(map)
    map.setView([CENTRO_PADRAO.lat, CENTRO_PADRAO.lng], 11)
    camadaRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      camadaRef.current = null
    }
  }, [])

  // Enquadra a vista quando o conjunto de pontos muda (não a cada hover).
  const pontos: Ponto[] = [...(origem ? [origem] : []), ...trajetos.flatMap((t) => t.paradas.map((p) => p.ponto))]
  const assinatura = pontos.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const bbox = limites(pontos)
    if (!bbox) {
      map.setView([CENTRO_PADRAO.lat, CENTRO_PADRAO.lng], 11)
    } else if (bbox[0].lat === bbox[1].lat && bbox[0].lng === bbox[1].lng) {
      map.setView([bbox[0].lat, bbox[0].lng], 14)
    } else {
      map.fitBounds(
        L.latLngBounds([bbox[0].lat, bbox[0].lng], [bbox[1].lat, bbox[1].lng]),
        { padding: [40, 40], maxZoom: 16 },
      )
    }
    // Reflui o tamanho após montar (container pode nascer com altura 0 em transições).
    map.invalidateSize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura])

  // Redesenha paradas e trajetos a cada mudança de dados ou de destaque.
  useEffect(() => {
    const camada = camadaRef.current
    if (!camada) return
    camada.clearLayers()

    if (origem) {
      L.marker([origem.lat, origem.lng], { icon: iconeLoja(), interactive: true, keyboard: false })
        .bindTooltip('Saída da loja', { direction: 'top' })
        .addTo(camada)
    }

    for (const t of trajetos) {
      const destaque = ativa === t.ordemSaida
      const apagado = ativa !== null && !destaque
      if (t.linha.length >= 2) {
        L.polyline(
          t.linha.map((p) => [p.lat, p.lng] as [number, number]),
          {
            color: t.cor,
            weight: destaque ? 5 : 3,
            opacity: apagado ? 0.25 : destaque ? 0.95 : 0.7,
            dashArray: '1 8',
            lineCap: 'round',
          },
        )
          .on('click', () => onAtivaRef.current(t.ordemSaida))
          .addTo(camada)
      }
      for (const p of t.paradas) {
        const m = L.marker([p.ponto.lat, p.ponto.lng], {
          icon: iconeParada(p.ordem, t.cor, destaque),
          opacity: apagado ? 0.4 : 1,
          title: `Corrida ${t.ordemSaida} · parada ${p.ordem} · pedido ${p.parada.codigo}`,
        })
          .bindTooltip(`Pedido ${p.parada.codigo}`, { direction: 'top' })
          .on('click', () => onAtivaRef.current(t.ordemSaida))
        m.addTo(camada)
      }
    }
  }, [origem, trajetos, ativa])

  return <div ref={elRef} className="size-full" role="application" aria-label="Mapa das corridas sugeridas" />
}
