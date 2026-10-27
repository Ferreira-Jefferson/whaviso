import { describe, it, expect } from 'vitest'
import { minutos, razao, ticketMedio } from './metricas'
import { MAX_DIAS, normalizarPeriodo, PeriodoInvalido } from './periodo'

describe('metricas', () => {
  it('ticket medio arredonda e devolve null sem entregas', () => {
    expect(ticketMedio(1000, 3)).toBe(333)
    expect(ticketMedio(0, 0)).toBeNull()
  })
  it('razao e minutos tratam zero/null', () => {
    expect(razao(1, 4)).toBe(0.25)
    expect(razao(0, 0)).toBeNull()
    expect(minutos(12.345)).toBe(12.3)
    expect(minutos(null)).toBeNull()
  })
})

describe('periodo', () => {
  it('um dia SP e [03:00Z, 03:00Z do dia seguinte) (UTC-3)', () => {
    const p = normalizarPeriodo('2026-03-10', '2026-03-10')
    expect(p.inicio.toISOString()).toBe('2026-03-10T03:00:00.000Z')
    expect(p.fim.toISOString()).toBe('2026-03-11T03:00:00.000Z')
  })
  it('default = ultimos 30 dias ate hoje (SP), mesmo perto da meia-noite UTC', () => {
    // 2026-03-11T01:00Z ainda e dia 10 em SP
    const p = normalizarPeriodo(undefined, undefined, new Date('2026-03-11T01:00:00Z'))
    expect(p.ate).toBe('2026-03-10')
    expect(p.de).toBe('2026-02-09')
  })
  it('rejeita de > ate e mais de 366 dias', () => {
    expect(() => normalizarPeriodo('2026-03-11', '2026-03-10')).toThrow(PeriodoInvalido)
    expect(() => normalizarPeriodo('2025-01-01', '2026-03-10')).toThrow(PeriodoInvalido)
    expect(() => normalizarPeriodo('2025-03-10', '2026-03-10')).not.toThrow()
    expect(MAX_DIAS).toBe(366)
  })
})
