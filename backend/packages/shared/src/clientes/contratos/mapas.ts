import { describe, it, expect } from 'vitest'
import { ErroProvedor } from '../erros'
import type { ClienteMapas, Ponto } from '../mapas'

const A: Ponto = { lat: -23.55, lng: -46.63 }
const B: Ponto = { lat: -23.56, lng: -46.64 }
const C: Ponto = { lat: -23.6, lng: -46.7 }

/** Suite de contrato: stub, fake e a implementacao real (API-roteiriza) devem passar. */
export function contratoClienteMapas(nome: string, fabrica: () => ClienteMapas): void {
  describe(`contrato ClienteMapas: ${nome}`, () => {
    it('geocodificar devolve ponto valido e precisao, ou erro tipado', async () => {
      const r = await fabrica().geocodificar('Rua Exemplo 100, Sao Paulo')
      if (r.ok) {
        expect(Math.abs(r.valor.lat)).toBeLessThanOrEqual(90)
        expect(Math.abs(r.valor.lng)).toBeLessThanOrEqual(180)
        expect(r.valor.precisao).toMatch(/.+/)
      } else expect(r.erro).toBeInstanceOf(ErroProvedor)
    })

    it('matriz tem dimensao origens x destinos e diagonal zero quando os pontos coincidem', async () => {
      const r = await fabrica().matriz([A, B], [A, C, B])
      if (!r.ok) return
      expect(r.valor.distanciasM).toHaveLength(2)
      expect(r.valor.distanciasM[0]).toHaveLength(3)
      expect(r.valor.duracoesS).toHaveLength(2)
      expect(r.valor.distanciasM[0]![0]).toBe(0)
      expect(r.valor.distanciasM[0]![1]!).toBeGreaterThan(0)
    })

    it('rota visita todas as paradas uma vez, comecando pela origem', async () => {
      const r = await fabrica().rota([A, C, B])
      if (!r.ok) return
      expect(r.valor.ordem[0]).toBe(0)
      expect([...r.valor.ordem].sort()).toEqual([0, 1, 2])
      expect(r.valor.distanciaM).toBeGreaterThan(0)
      expect(r.valor.duracaoS).toBeGreaterThan(0)
    })
  })
}
