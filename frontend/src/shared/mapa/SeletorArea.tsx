// Seletor de area de entrega (camada publica, reutilizavel). O usuario DEFINE a area DESENHANDO no
// mapa, nunca digitando latitude/longitude. Dois modos:
//  - raio: um circulo com centro (icone de lojinha) e borda arrastaveis, em dois sentidos com um
//    campo de km (digitar muda o circulo; arrastar a borda muda o km).
//  - poligono: clicar no mapa para marcar vertices (borda tracejada), arrastar para ajustar, mais os
//    botoes "Desfazer ultimo ponto" e "Limpar".
// O leaflet entra por import() lazy (chunk pesado fora do bundle principal), igual ao MapaDespacho.
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Button, Field, Input, Skeleton } from '@/shared/ui'
import {
  CENTRO_PADRAO,
  anelParaVertices,
  kmParaMetros,
  metrosParaKm,
  montarAnelFechado,
  type AreaGeo,
  type PontoMapa,
} from './tipos'

const SeletorAreaLeaflet = lazy(() => import('./SeletorAreaLeaflet'))

// Raio padrao quando ainda nao ha area definida (3 km).
const PADRAO_METROS = 3000

interface Props {
  modo: 'raio' | 'poligono'
  valor: AreaGeo | null
  onChange: (v: AreaGeo) => void
  /** Ponto da loja (centro padrao do raio e referencia visual); null quando nao ha geocode. */
  centroLoja: PontoMapa | null
  /** Teto do raio em km. Padrao 50. */
  raioKmMax?: number
}

type AreaRaio = Extract<AreaGeo, { tipo: 'raio' }>

function formatarKm(km: number): string {
  const r = Math.round(km * 100) / 100
  return String(r).replace('.', ',')
}

function lerKm(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const moldura =
  'relative h-[clamp(280px,42vh,460px)] overflow-hidden rounded-card border border-linha bg-papel-2'

const carregando = (
  <div className="flex size-full items-center justify-center">
    <Skeleton className="size-full" />
  </div>
)

export function SeletorArea({ modo, valor, onChange, centroLoja, raioKmMax = 50 }: Props) {
  if (modo === 'raio') {
    return (
      <SeletorRaio
        valor={valor && valor.tipo === 'raio' ? valor : null}
        onChange={onChange}
        centroLoja={centroLoja}
        raioKmMax={raioKmMax}
      />
    )
  }
  return (
    <SeletorPoligono
      valor={valor && valor.tipo === 'poligono' ? valor : null}
      onChange={onChange}
      centroLoja={centroLoja}
    />
  )
}

// ---------------------------------------------------------------------------------------------
// Modo raio
// ---------------------------------------------------------------------------------------------
function SeletorRaio({
  valor,
  onChange,
  centroLoja,
  raioKmMax,
}: {
  valor: AreaRaio | null
  onChange: (v: AreaGeo) => void
  centroLoja: PontoMapa | null
  raioKmMax: number
}) {
  const clampKm = (km: number) => Math.min(Math.max(km, 0), raioKmMax)

  const [area, setArea] = useState<AreaRaio>(() => ({
    tipo: 'raio',
    centro: valor?.centro ?? centroLoja ?? CENTRO_PADRAO,
    metros: valor?.metros ?? PADRAO_METROS,
  }))
  // Flag: o usuario ja mexeu (ou ja havia valor), entao nao recentramos quando a loja geocodificar.
  const interagiu = useRef(valor != null)
  const [kmTexto, setKmTexto] = useState(() => formatarKm(metrosParaKm(area.metros)))

  // Valor vindo de fora (pai controlado): adota.
  useEffect(() => {
    if (valor) {
      setArea(valor)
      interagiu.current = true
    }
  }, [valor])

  // A loja pode geocodificar depois de montar: centra nela enquanto nao houve interacao nem valor.
  useEffect(() => {
    if (!interagiu.current && !valor && centroLoja) {
      setArea((a) => ({ ...a, centro: centroLoja }))
    }
  }, [centroLoja, valor])

  // Reflete no campo de km as mudancas de raio vindas do mapa, sem atropelar a digitacao em curso.
  useEffect(() => {
    const km = lerKm(kmTexto)
    const metrosDoTexto = km === null ? null : kmParaMetros(clampKm(km))
    if (metrosDoTexto === null || Math.abs(metrosDoTexto - area.metros) > 0.5) {
      setKmTexto(formatarKm(metrosParaKm(area.metros)))
    }
    // Reage so a mudanca de metros; kmTexto e lido como snapshot de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.metros])

  function aplicar(next: AreaRaio) {
    interagiu.current = true
    setArea(next)
    onChange(next)
  }

  function aoDigitarKm(texto: string) {
    setKmTexto(texto)
    const km = lerKm(texto)
    if (km !== null) aplicar({ ...area, metros: kmParaMetros(clampKm(km)) })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-40">
        <Field label="Raio (km)" dica={`Entre 0 e ${raioKmMax} km. Arraste a borda do circulo ou digite aqui.`}>
          <Input
            type="text"
            inputMode="decimal"
            value={kmTexto}
            onChange={(e) => aoDigitarKm(e.target.value)}
            aria-label="Raio da area de entrega em quilometros"
          />
        </Field>
      </div>
      <div className={moldura}>
        <Suspense fallback={carregando}>
          <SeletorAreaLeaflet
            modo="raio"
            centroLoja={centroLoja}
            centro={area.centro}
            metros={area.metros}
            raioMetrosMax={kmParaMetros(raioKmMax)}
            onCentro={(centro) => aplicar({ ...area, centro })}
            onMetros={(metros) => aplicar({ ...area, metros })}
            vertices={[]}
            onAdicionarVertice={() => undefined}
            onMoverVertice={() => undefined}
          />
        </Suspense>
      </div>
      <p className="text-sm text-tinta-2">
        Clique para marcar o centro e arraste a borda para ajustar o raio.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Modo poligono
// ---------------------------------------------------------------------------------------------
function SeletorPoligono({
  valor,
  onChange,
  centroLoja,
}: {
  valor: Extract<AreaGeo, { tipo: 'poligono' }> | null
  onChange: (v: AreaGeo) => void
  centroLoja: PontoMapa | null
}) {
  const [vertices, setVertices] = useState<PontoMapa[]>(() =>
    valor ? anelParaVertices(valor.anel) : [],
  )

  // Valor vindo de fora (pai controlado): adota.
  useEffect(() => {
    if (valor) setVertices(anelParaVertices(valor.anel))
  }, [valor])

  // Emite onChange so quando da para formar um anel fechado (>= 3 vertices distintos).
  function aplicar(next: PontoMapa[]) {
    setVertices(next)
    const anel = montarAnelFechado(next)
    if (anel) onChange({ tipo: 'poligono', anel })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={moldura}>
        <Suspense fallback={carregando}>
          <SeletorAreaLeaflet
            modo="poligono"
            centroLoja={centroLoja}
            centro={centroLoja ?? CENTRO_PADRAO}
            metros={0}
            raioMetrosMax={0}
            onCentro={() => undefined}
            onMetros={() => undefined}
            vertices={vertices}
            onAdicionarVertice={(p) => aplicar([...vertices, p])}
            onMoverVertice={(i, p) => aplicar(vertices.map((v, j) => (j === i ? p : v)))}
          />
        </Suspense>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variante="secondary"
          disabled={vertices.length === 0}
          onClick={() => aplicar(vertices.slice(0, -1))}
        >
          Desfazer ultimo ponto
        </Button>
        <Button
          type="button"
          variante="secondary"
          disabled={vertices.length === 0}
          onClick={() => aplicar([])}
        >
          Limpar
        </Button>
        <p className="text-sm text-tinta-2">
          Clique no mapa para desenhar a area; arraste os pontos para ajustar.
        </p>
      </div>
    </div>
  )
}
