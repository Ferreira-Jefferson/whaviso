// Unidade das definicoes de metrica contra fixtures manuais (sem banco).
import { describe, it, expect } from 'vitest'
import { arpa, churnContas, churnMrr, conversaoFunil, conversaoTrial, razao, recuarMeses, rotuloMes } from './metricas'

describe('plataforma_painel: metricas', () => {
  it('mes sem base: divisao por zero devolve null, nunca 0', () => {
    expect(razao(0, 0)).toBeNull()
    expect(churnContas(3, 0)).toBeNull()
    expect(churnMrr(0, 0)).toBeNull()
    expect(conversaoFunil(0, 0)).toBeNull()
    expect(conversaoTrial(0, 0)).toBeNull()
    expect(arpa(0, 0)).toBeNull()
  })

  it('churn 100% e churn parcial', () => {
    expect(churnContas(4, 4)).toBe(1)
    expect(churnContas(1, 4)).toBe(0.25)
    expect(churnMrr(70000, 280000)).toBe(0.25)
    expect(churnContas(0, 10)).toBe(0)
  })

  it('razao nunca passa de 1 (cancelamento sem base coerente)', () => {
    expect(razao(5, 4)).toBe(1)
  })

  it('ARPA em centavos inteiros', () => {
    expect(arpa(210000, 3)).toBe(70000)
    expect(arpa(100000, 3)).toBe(33333)
    expect(Number.isInteger(arpa(100001, 3))).toBe(true)
  })

  it('conversoes', () => {
    expect(conversaoFunil(2, 8)).toBe(0.25)
    expect(conversaoTrial(3, 4)).toBe(0.75)
  })

  it('rotulo e recuo de meses com virada de ano', () => {
    expect(rotuloMes(2026, 3)).toBe('2026-03')
    expect(recuarMeses(2026, 1, 1)).toEqual({ ano: 2025, mes: 12 })
    expect(recuarMeses(2026, 3, 14)).toEqual({ ano: 2025, mes: 1 })
    expect(recuarMeses(2026, 12, 0)).toEqual({ ano: 2026, mes: 12 })
  })
})
