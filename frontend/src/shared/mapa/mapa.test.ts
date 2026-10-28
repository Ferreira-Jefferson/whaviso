// Testes das funcoes puras do seletor de area (km<->metros, anel fechado, ida e volta vertice<->anel).
// O renderizador leaflet (SeletorAreaLeaflet) nao roda em jsdom, entao nao e testado aqui.
import { describe, expect, it } from 'vitest'
import {
  CENTRO_PADRAO,
  anelParaVertices,
  kmParaMetros,
  metrosParaKm,
  montarAnelFechado,
  verticesDistintos,
  type PontoMapa,
} from './tipos'

describe('mapa/tipos', () => {
  it('km<->metros: converte e ida e volta', () => {
    expect(kmParaMetros(3)).toBe(3000)
    expect(kmParaMetros(0)).toBe(0)
    expect(metrosParaKm(1500)).toBe(1.5)
    expect(metrosParaKm(kmParaMetros(7.25))).toBeCloseTo(7.25, 10)
  })

  it('CENTRO_PADRAO e Sao Paulo', () => {
    expect(CENTRO_PADRAO.lat).toBeCloseTo(-23.55052, 5)
    expect(CENTRO_PADRAO.lng).toBeCloseTo(-46.633308, 5)
  })

  it('verticesDistintos remove pontos repetidos preservando a ordem', () => {
    const vs: PontoMapa[] = [
      { lat: 1, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
      { lat: 2, lng: 2 },
    ]
    expect(verticesDistintos(vs)).toEqual([
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ])
  })

  it('montarAnelFechado: null com menos de 3 vertices distintos', () => {
    expect(montarAnelFechado([])).toBeNull()
    expect(montarAnelFechado([{ lat: 1, lng: 1 }])).toBeNull()
    expect(
      montarAnelFechado([
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ]),
    ).toBeNull()
    // 3 pontos mas so 2 distintos -> ainda null.
    expect(
      montarAnelFechado([
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 1, lng: 1 },
      ]),
    ).toBeNull()
  })

  it('montarAnelFechado: anel GeoJSON [lng,lat] fechado com >= 4 posicoes', () => {
    const anel = montarAnelFechado([
      { lat: -23.5, lng: -46.6 },
      { lat: -23.6, lng: -46.7 },
      { lat: -23.4, lng: -46.5 },
    ])
    expect(anel).not.toBeNull()
    const a = anel!
    expect(a.length).toBe(4) // 3 vertices + fechamento
    expect(a.length).toBeGreaterThanOrEqual(4)
    // ordem [lng, lat]
    expect(a[0]).toEqual([-46.6, -23.5])
    // primeiro = ultimo (fechado)
    expect(a[a.length - 1]).toEqual(a[0])
  })

  it('anelParaVertices: ida e volta descartando o fechamento', () => {
    const vertices: PontoMapa[] = [
      { lat: -23.5, lng: -46.6 },
      { lat: -23.6, lng: -46.7 },
      { lat: -23.4, lng: -46.5 },
    ]
    const anel = montarAnelFechado(vertices)!
    expect(anelParaVertices(anel)).toEqual(vertices)
  })
})
