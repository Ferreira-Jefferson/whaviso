// Renderizador imperativo do seletor de area (chunk pesado: so entra pelo import() lazy do
// SeletorArea). Toda a interacao leaflet mora aqui: no modo raio um L.circle com marcador de centro
// arrastavel (icone de lojinha) e um handle de borda arrastavel; no modo poligono um L.polygon
// tracejado com vertices arrastaveis e clique no mapa para adicionar vertice. Em nenhum momento
// aparece latitude/longitude: o usuario so aponta e arrasta. O raio e tratado em metros (= radius do
// L.circle). Nenhuma chamada a provedor de dados sai daqui: so os tiles do host do CSP (SEC-070/090).
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CENTRO_PADRAO, type PontoMapa } from './tipos'

// Host de tiles: OpenStreetMap (livre), ja liberado no img-src do CSP. Trocar de provedor e so aqui.
const TILES_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILES_ATRIB = '&copy; OpenStreetMap'

interface Props {
  modo: 'raio' | 'poligono' | 'ponto'
  /** Ponto da loja (referencia visual); null quando a loja nao tem endereco/geocode. */
  centroLoja: PontoMapa | null
  // --- raio e ponto ---
  centro: PontoMapa
  metros: number
  raioMetrosMax: number
  onCentro: (p: PontoMapa) => void
  onMetros: (metros: number) => void
  /** Modo ponto: desenha o marcador so quando ha um ponto definido (clique define o primeiro). */
  mostrarPonto?: boolean
  // --- poligono ---
  vertices: PontoMapa[]
  onAdicionarVertice: (p: PontoMapa) => void
  onMoverVertice: (indice: number, p: PontoMapa) => void
}

// Icone da loja: mesmo visual do MapaLeaflet (circulo verde #20322a com a lojinha em #faf7f0).
function iconeLoja(): L.DivIcon {
  const html =
    '<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;' +
    'border-radius:9999px;background:#20322a;color:#faf7f0;box-shadow:0 1px 4px rgba(0,0,0,.35)">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 4 4h16l1 5"/><path d="M4 9v11h16V9"/>' +
    '<path d="M9 20v-6h6v6"/></svg></span>'
  return L.divIcon({ html, className: 'whv-mapa-loja', iconSize: [30, 30], iconAnchor: [15, 15] })
}

// Handle de borda do circulo: botaozinho branco com miolo verde (arrastar = ajustar o raio).
function iconeHandle(): L.DivIcon {
  const html =
    '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#faf7f0;' +
    'border:3px solid #20322a;box-shadow:0 1px 3px rgba(0,0,0,.35);cursor:ew-resize"></span>'
  return L.divIcon({ html, className: 'whv-mapa-handle', iconSize: [16, 16], iconAnchor: [8, 8] })
}

// Vertice numerado do poligono (arrastavel).
function iconeVertice(numero: number): L.DivIcon {
  const html =
    '<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;' +
    'border-radius:9999px;background:#20322a;color:#faf7f0;border:2px solid #faf7f0;' +
    "font:700 11px/1 Karla,system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:grab\">" +
    `${numero}</span>`
  return L.divIcon({ html, className: 'whv-mapa-vertice', iconSize: [22, 22], iconAnchor: [11, 11] })
}

export default function SeletorAreaLeaflet(props: Props) {
  const { modo, centroLoja, centro, metros, vertices, mostrarPonto } = props

  const elRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  // Camadas do modo raio.
  const circuloRef = useRef<L.Circle | null>(null)
  const centroMkRef = useRef<L.Marker | null>(null)
  const handleMkRef = useRef<L.Marker | null>(null)
  // Camada do modo ponto.
  const pontoMkRef = useRef<L.Marker | null>(null)
  // Camadas do modo poligono.
  const grupoRef = useRef<L.LayerGroup | null>(null)
  const poligonoRef = useRef<L.Polygon | null>(null)

  // Refs com os valores/callbacks mais recentes, para os handlers nao recriarem o mapa.
  const maxRef = useRef(props.raioMetrosMax)
  maxRef.current = props.raioMetrosMax
  const centroRef = useRef(centro)
  centroRef.current = centro
  const metrosRef = useRef(metros)
  metrosRef.current = metros
  const verticesRef = useRef(vertices)
  verticesRef.current = vertices
  const cbRef = useRef({
    onCentro: props.onCentro,
    onMetros: props.onMetros,
    onAdicionarVertice: props.onAdicionarVertice,
    onMoverVertice: props.onMoverVertice,
  })
  cbRef.current = {
    onCentro: props.onCentro,
    onMetros: props.onMetros,
    onAdicionarVertice: props.onAdicionarVertice,
    onMoverVertice: props.onMoverVertice,
  }

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true })
    L.tileLayer(TILES_URL, { maxZoom: 19, attribution: TILES_ATRIB }).addTo(map)
    map.setView([CENTRO_PADRAO.lat, CENTRO_PADRAO.lng], 11)
    mapRef.current = map
    // Reflui o tamanho apos montar (container pode nascer com altura 0 em transicoes).
    map.invalidateSize()
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Modo raio: cria circulo, marcador de centro (lojinha) e handle de borda; liga arraste e clique.
  useEffect(() => {
    const map = mapRef.current
    if (!map || modo !== 'raio') return

    const c = centroRef.current
    const circulo = L.circle([c.lat, c.lng], {
      radius: metrosRef.current,
      color: '#20322a',
      weight: 2,
      fillColor: '#20322a',
      fillOpacity: 0.12,
    }).addTo(map)
    circuloRef.current = circulo

    const centroMk = L.marker([c.lat, c.lng], {
      icon: iconeLoja(),
      draggable: true,
      keyboard: false,
      title: 'Centro da area (arraste para mover)',
    }).addTo(map)
    centroMkRef.current = centroMk

    const handle = L.marker([c.lat, circulo.getBounds().getEast()], {
      icon: iconeHandle(),
      draggable: true,
      keyboard: false,
      title: 'Arraste para ajustar o raio',
    }).addTo(map)
    handleMkRef.current = handle

    map.fitBounds(circulo.getBounds(), { padding: [40, 40], maxZoom: 16 })

    // Arrastar o handle: ajusta o raio pela distancia ao centro (ao vivo e no fim).
    const aoArrastarHandle = () => {
      const d = map.distance(centroMk.getLatLng(), handle.getLatLng())
      circulo.setRadius(Math.min(d, maxRef.current))
    }
    const aoSoltarHandle = () => {
      const d = map.distance(centroMk.getLatLng(), handle.getLatLng())
      const metrosFinal = Math.max(0, Math.min(d, maxRef.current))
      circulo.setRadius(metrosFinal)
      // Normaliza o handle de volta para a borda leste do circulo.
      handle.setLatLng([centroMk.getLatLng().lat, circulo.getBounds().getEast()])
      cbRef.current.onMetros(metrosFinal)
    }
    handle.on('drag', aoArrastarHandle)
    handle.on('dragend', aoSoltarHandle)

    // Arrastar o centro: move circulo e handle junto.
    const aoArrastarCentro = () => {
      const p = centroMk.getLatLng()
      circulo.setLatLng(p)
      handle.setLatLng([p.lat, circulo.getBounds().getEast()])
    }
    const aoSoltarCentro = () => {
      const p = centroMk.getLatLng()
      cbRef.current.onCentro({ lat: p.lat, lng: p.lng })
    }
    centroMk.on('drag', aoArrastarCentro)
    centroMk.on('dragend', aoSoltarCentro)

    // Clicar no mapa reposiciona o centro.
    const aoClicar = (e: L.LeafletMouseEvent) => {
      cbRef.current.onCentro({ lat: e.latlng.lat, lng: e.latlng.lng })
    }
    map.on('click', aoClicar)

    return () => {
      map.off('click', aoClicar)
      circulo.remove()
      centroMk.remove()
      handle.remove()
      circuloRef.current = null
      centroMkRef.current = null
      handleMkRef.current = null
    }
  }, [modo])

  // Modo raio: sincroniza a vista do circulo quando centro/metros mudam de fora (input de km, pai).
  useEffect(() => {
    const circulo = circuloRef.current
    const centroMk = centroMkRef.current
    const handle = handleMkRef.current
    if (modo !== 'raio' || !circulo || !centroMk || !handle) return
    circulo.setLatLng([centro.lat, centro.lng])
    circulo.setRadius(metros)
    centroMk.setLatLng([centro.lat, centro.lng])
    handle.setLatLng([centro.lat, circulo.getBounds().getEast()])
  }, [modo, centro.lat, centro.lng, metros])

  // Modo ponto: um unico marcador (icone da loja) arrastavel + clique para posicionar. O marcador so
  // aparece quando ha ponto definido (mostrarPonto); o primeiro clique no mapa define o ponto.
  useEffect(() => {
    const map = mapRef.current
    if (!map || modo !== 'ponto') return

    const c = centroRef.current
    map.setView([c.lat, c.lng], 14)

    let marcador: L.Marker | null = null
    if (mostrarPonto) {
      marcador = L.marker([c.lat, c.lng], {
        icon: iconeLoja(),
        draggable: true,
        keyboard: false,
        title: 'Origem (arraste para mover)',
      }).addTo(map)
      marcador.on('dragend', () => {
        const p = marcador!.getLatLng()
        cbRef.current.onCentro({ lat: p.lat, lng: p.lng })
      })
    }
    pontoMkRef.current = marcador

    const aoClicar = (e: L.LeafletMouseEvent) => {
      cbRef.current.onCentro({ lat: e.latlng.lat, lng: e.latlng.lng })
    }
    map.on('click', aoClicar)

    return () => {
      map.off('click', aoClicar)
      marcador?.remove()
      pontoMkRef.current = null
    }
  }, [modo, mostrarPonto])

  // Modo ponto: move o marcador quando o ponto muda de fora (ex.: "usar o endereco da loja").
  useEffect(() => {
    const mk = pontoMkRef.current
    if (modo !== 'ponto' || !mk) return
    mk.setLatLng([centro.lat, centro.lng])
  }, [modo, centro.lat, centro.lng])

  // Modo poligono: grupo de camadas + clique para adicionar vertice.
  useEffect(() => {
    const map = mapRef.current
    if (!map || modo !== 'poligono') return

    const grupo = L.layerGroup().addTo(map)
    grupoRef.current = grupo

    // Vista inicial: nos vertices existentes, senao na loja, senao no centro padrao.
    const vs = verticesRef.current
    if (vs.length >= 1) {
      map.fitBounds(L.latLngBounds(vs.map((v) => [v.lat, v.lng] as [number, number])), {
        padding: [40, 40],
        maxZoom: 16,
      })
    } else if (centroLoja) {
      map.setView([centroLoja.lat, centroLoja.lng], 13)
    }

    const aoClicar = (e: L.LeafletMouseEvent) => {
      cbRef.current.onAdicionarVertice({ lat: e.latlng.lat, lng: e.latlng.lng })
    }
    map.on('click', aoClicar)

    return () => {
      map.off('click', aoClicar)
      poligonoRef.current?.remove()
      poligonoRef.current = null
      grupo.remove()
      grupoRef.current = null
    }
  }, [modo, centroLoja])

  // Modo poligono: desenha o anel tracejado, o icone da loja e os vertices arrastaveis.
  const verticesKey = vertices.map((v) => `${v.lat.toFixed(6)},${v.lng.toFixed(6)}`).join('|')
  useEffect(() => {
    const map = mapRef.current
    const grupo = grupoRef.current
    if (!map || modo !== 'poligono' || !grupo) return
    grupo.clearLayers()

    if (centroLoja) {
      L.marker([centroLoja.lat, centroLoja.lng], {
        icon: iconeLoja(),
        interactive: false,
        keyboard: false,
      }).addTo(grupo)
    }

    poligonoRef.current?.remove()
    if (vertices.length >= 2) {
      poligonoRef.current = L.polygon(
        vertices.map((v) => [v.lat, v.lng] as [number, number]),
        { color: '#20322a', weight: 2, dashArray: '6 6', fillColor: '#20322a', fillOpacity: 0.1 },
      ).addTo(map)
    } else {
      poligonoRef.current = null
    }

    vertices.forEach((v, i) => {
      const mk = L.marker([v.lat, v.lng], {
        icon: iconeVertice(i + 1),
        draggable: true,
        keyboard: false,
        title: `Ponto ${i + 1} (arraste para ajustar)`,
      }).addTo(grupo)
      mk.on('drag', () => {
        const poly = poligonoRef.current
        if (!poly) return
        const p = mk.getLatLng()
        poly.setLatLngs(
          vertices.map((vv, j) => (j === i ? [p.lat, p.lng] : [vv.lat, vv.lng]) as [number, number]),
        )
      })
      mk.on('dragend', () => {
        const p = mk.getLatLng()
        cbRef.current.onMoverVertice(i, { lat: p.lat, lng: p.lng })
      })
    })
    // verticesKey (derivado de vertices) e a dependencia real; vertices entra como snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, verticesKey, centroLoja])

  return (
    <div
      ref={elRef}
      className="size-full"
      role="application"
      aria-label={
        modo === 'raio'
          ? 'Mapa para definir o raio de entrega'
          : modo === 'ponto'
            ? 'Mapa para marcar a origem das corridas'
            : 'Mapa para desenhar a area de entrega'
      }
    />
  )
}
