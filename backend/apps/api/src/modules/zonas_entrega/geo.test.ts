import { describe, expect, it } from 'vitest'
import { distanciaMetros, normalizarBairro, pontoNoPoligono, pontoNoRaio } from './geo'

// Quadrado [lng, lat] de 0 a 10, fechado.
const quadrado: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
]
// "U" concavo: o vao central (x 4..6, y 4..10) fica fora.
const u: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [6, 10],
  [6, 4],
  [4, 4],
  [4, 10],
  [0, 10],
  [0, 0],
]

describe('geo: pontoNoPoligono', () => {
  it('dentro, fora e nas bordas (aresta e vertice contam como dentro)', () => {
    expect(pontoNoPoligono({ lng: 5, lat: 5 }, quadrado)).toBe(true)
    expect(pontoNoPoligono({ lng: 11, lat: 5 }, quadrado)).toBe(false)
    expect(pontoNoPoligono({ lng: 5, lat: 0 }, quadrado)).toBe(true)
    expect(pontoNoPoligono({ lng: 10, lat: 10 }, quadrado)).toBe(true)
  })
  it('poligono concavo: o vao fica fora, os bracos dentro', () => {
    expect(pontoNoPoligono({ lng: 5, lat: 7 }, u)).toBe(false)
    expect(pontoNoPoligono({ lng: 2, lat: 7 }, u)).toBe(true)
    expect(pontoNoPoligono({ lng: 5, lat: 2 }, u)).toBe(true)
  })
})

describe('geo: distancia e raio', () => {
  it('haversine: zero para o mesmo ponto e ~111 km por grau de latitude', () => {
    const p = { lat: -23.55, lng: -46.63 }
    expect(distanciaMetros(p, p)).toBe(0)
    const d = distanciaMetros({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeGreaterThan(111_000)
    expect(d).toBeLessThan(111_400)
  })
  it('raio: borda inclusa, alem fora', () => {
    const c = { lat: 0, lng: 0 }
    const d = distanciaMetros(c, { lat: 0.01, lng: 0 })
    expect(pontoNoRaio({ lat: 0.01, lng: 0 }, c, Math.ceil(d))).toBe(true)
    expect(pontoNoRaio({ lat: 0.01, lng: 0 }, c, Math.floor(d) - 1)).toBe(false)
  })
})

describe('geo: normalizarBairro', () => {
  it('ignora acento, caixa e espacos extras', () => {
    expect(normalizarBairro('  Vila   Madalena ')).toBe('vila madalena')
    expect(normalizarBairro('SÃO JOÃO')).toBe(normalizarBairro('sao joao'))
    expect(normalizarBairro('Jardim América')).toBe('jardim america')
  })
})
