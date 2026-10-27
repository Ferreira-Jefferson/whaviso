import { describe, expect, it } from 'vitest'
import { contratoClienteMapas } from './contratos/mapas'
import { criarMapasOsm, criarMapasOsmDoAmbiente } from './mapas_osm'

// Toda a suite e deterministica: nenhum teste toca a rede (fetchImpl e resolverDns injetados) e
// nenhum timer real dispara (agendar no-op). Cobre parsing, precisao, rate-limit, erros e SSRF.

const BASE = {
  nominatimBaseUrl: 'https://nominatim.test',
  osrmBaseUrl: 'https://osrm.test',
  userAgent: 'whaviso-teste/1.0 (+teste@whaviso.test)',
  resolverDns: async () => ['93.184.216.34'],
  agendar: () => () => {},
  dormir: async () => {},
} as const

const respJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const euclid = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.round(Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111_000)

function coordsDoPath(url: URL): { lng: number; lat: number }[] {
  const seg = url.pathname.split('/driving/')[1] ?? ''
  return seg.split(';').map((c) => {
    const [lng, lat] = c.split(',').map(Number) as [number, number]
    return { lng, lat }
  })
}

/** fetch feliz: geocode devolve 1 ponto; table e trip calculados dos coords da URL. */
const fetchFeliz = ((input: string | URL) => {
  const url = new URL(input instanceof URL ? input.href : String(input))
  if (url.pathname.endsWith('/search')) {
    return Promise.resolve(respJson([{ lat: '-23.5500', lon: '-46.6300', addresstype: 'road', type: 'residential' }]))
  }
  if (url.pathname.includes('/table/')) {
    const coords = coordsDoPath(url)
    const src = (url.searchParams.get('sources') ?? '').split(';').map(Number)
    const dst = (url.searchParams.get('destinations') ?? '').split(';').map(Number)
    const distances = src.map((s) => dst.map((d) => euclid(coords[s]!, coords[d]!)))
    const durations = distances.map((l) => l.map((m) => Math.round(m / 8)))
    return Promise.resolve(respJson({ code: 'Ok', distances, durations }))
  }
  if (url.pathname.includes('/trip/')) {
    const coords = coordsDoPath(url)
    // waypoint_index: origem fixa em 0, demais invertidos so para exercitar a reordenacao.
    const waypoints = coords.map((_, i) => ({ waypoint_index: i === 0 ? 0 : coords.length - i }))
    return Promise.resolve(respJson({ code: 'Ok', trips: [{ distance: 1234, duration: 567 }], waypoints }))
  }
  throw new Error(`url inesperada no mock: ${url.href}`)
}) as unknown as typeof fetch

const clienteFeliz = () => criarMapasOsm({ ...BASE, fetchImpl: fetchFeliz })

// Suite de contrato reutilizavel (mesma do stub/fake): a impl real tem de passar.
contratoClienteMapas('mapas_osm (Nominatim + OSRM, mockado)', clienteFeliz)

describe('mapas_osm: geocodificar', () => {
  it('parseia lat/lng e mapeia precisao a partir do addresstype', async () => {
    const r = await clienteFeliz().geocodificar('Rua Exemplo 100, Sao Paulo')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toEqual({ lat: -23.55, lng: -46.63, precisao: 'rua' })
  })

  it.each([
    ['house', 'exata'],
    ['road', 'rua'],
    ['suburb', 'bairro'],
    ['city', 'cidade'],
    ['administrative', 'aproximada'],
  ])('addresstype %s -> precisao %s', async (addresstype, esperado) => {
    const fetchImpl = (() => Promise.resolve(respJson([{ lat: '-23.5', lon: '-46.6', addresstype }]))) as unknown as typeof fetch
    const r = await criarMapasOsm({ ...BASE, fetchImpl }).geocodificar('x')
    expect(r.ok && r.valor.precisao).toBe(esperado)
  })

  it('resposta vazia vira Permanente endereco_nao_encontrado', async () => {
    const fetchImpl = (() => Promise.resolve(respJson([]))) as unknown as typeof fetch
    const r = await criarMapasOsm({ ...BASE, fetchImpl }).geocodificar('nada')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erro.codigo).toBe('endereco_nao_encontrado')
      expect(r.erro.retentavel).toBe(false)
    }
  })

  it('respeita o intervalo do Nominatim entre chamadas (rate-limit)', async () => {
    const t = 1_000
    const esperas: number[] = []
    const c = criarMapasOsm({
      ...BASE,
      fetchImpl: fetchFeliz,
      relogio: () => t,
      dormir: async (ms) => { esperas.push(ms) },
      intervaloNominatimMs: 1_000,
    })
    await c.geocodificar('a')
    await c.geocodificar('b')
    expect(esperas).toEqual([1_000])
  })
})

describe('mapas_osm: matriz e rota', () => {
  it('matriz devolve dimensoes corretas e diagonal zero nos pontos coincidentes', async () => {
    const A = { lat: -23.55, lng: -46.63 }
    const B = { lat: -23.56, lng: -46.64 }
    const r = await clienteFeliz().matriz([A, B], [A, B])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor.distanciasM[0]![0]).toBe(0)
      expect(r.valor.distanciasM[0]![1]!).toBeGreaterThan(0)
    }
  })

  it('matriz com trecho nulo (inalcancavel) vira falha retentavel', async () => {
    const fetchImpl = (() =>
      Promise.resolve(respJson({ code: 'Ok', distances: [[0, null]], durations: [[0, null]] }))) as unknown as typeof fetch
    const r = await criarMapasOsm({ ...BASE, fetchImpl }).matriz([{ lat: 0, lng: 0 }], [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('matriz_incompleta')
  })

  it('rota comeca na origem e devolve distancia/duracao', async () => {
    const r = await clienteFeliz().rota([{ lat: -23.55, lng: -46.63 }, { lat: -23.6, lng: -46.7 }, { lat: -23.56, lng: -46.64 }])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor.ordem[0]).toBe(0)
      expect([...r.valor.ordem].sort()).toEqual([0, 1, 2])
      expect(r.valor.distanciaM).toBe(1234)
      expect(r.valor.duracaoS).toBe(567)
    }
  })
})

describe('mapas_osm: erros de transporte', () => {
  const comStatus = (status: number) =>
    criarMapasOsm({ ...BASE, fetchImpl: (() => Promise.resolve(respJson([], status))) as unknown as typeof fetch })

  it('HTTP 429 vira RateLimit retentavel', async () => {
    const r = await comStatus(429).geocodificar('x')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erro.tipo).toBe('RateLimit')
      expect(r.erro.retentavel).toBe(true)
    }
  })

  it('HTTP 503 vira Transitorio retentavel', async () => {
    const r = await comStatus(503).geocodificar('x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.retentavel).toBe(true)
  })

  it('HTTP 404 vira Permanente nao retentavel', async () => {
    const r = await comStatus(404).geocodificar('x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.retentavel).toBe(false)
  })

  it('host que resolve para rede privada e bloqueado por SSRF (Permanente)', async () => {
    const naoChama = (() => { throw new Error('nao deveria conectar') }) as unknown as typeof fetch
    const c = criarMapasOsm({ ...BASE, fetchImpl: naoChama, resolverDns: async () => ['10.0.0.5'] })
    const r = await c.geocodificar('x')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erro.codigo).toBe('ssrf_bloqueado')
      expect(r.erro.retentavel).toBe(false)
    }
  })
})

describe('criarMapasOsmDoAmbiente', () => {
  it('devolve null sem as vars essenciais (cai no caminho offline)', () => {
    expect(criarMapasOsmDoAmbiente({})).toBeNull()
    expect(criarMapasOsmDoAmbiente({ API_MAPAS_NOMINATIM_URL: 'https://n.test' })).toBeNull()
    expect(
      criarMapasOsmDoAmbiente({ API_MAPAS_NOMINATIM_URL: 'https://n.test', API_MAPAS_OSRM_URL: 'https://o.test' }),
    ).toBeNull()
  })

  it('constroi o cliente quando base e contato estao presentes', () => {
    const c = criarMapasOsmDoAmbiente({
      API_MAPAS_NOMINATIM_URL: 'https://nominatim.test',
      API_MAPAS_OSRM_URL: 'https://osrm.test',
      API_MAPAS_CONTATO: 'contato@whaviso.test',
    })
    expect(c).not.toBeNull()
    expect(typeof c?.geocodificar).toBe('function')
  })
})
