import { describe, expect, it } from 'vitest'
import {
  fimDoDiaSp,
  formatarDataBr,
  formatarValorBr,
  hojeSp,
  instanteNoSegundoSp,
} from './index'

// São Paulo é UTC-3 o ano inteiro (sem horário de verão desde 2019): 09:00 SP == 12:00 UTC.

describe('instanteNoSegundoSp', () => {
  it('constrói o instante UTC no segundo do dia (SP)', () => {
    // 09:00:00 SP = 32400s = 12:00:00 UTC
    expect(instanteNoSegundoSp('2026-07-15', 9 * 3600).toISOString()).toBe(
      '2026-07-15T12:00:00.000Z',
    )
  })
  it('não desloca o dia civil', () => {
    expect(instanteNoSegundoSp('2026-07-15', 0).toISOString()).toBe('2026-07-15T03:00:00.000Z')
  })
})

describe('fimDoDiaSp e hojeSp', () => {
  it('são coerentes na virada do dia', () => {
    const fim = fimDoDiaSp('2026-07-15')
    expect(hojeSp(fim)).toBe('2026-07-15')
    expect(hojeSp(new Date(fim.getTime() + 1))).toBe('2026-07-16')
  })
})

describe('formatação BR', () => {
  it('formatarValorBr formata centavos', () => {
    expect(formatarValorBr(990)).toBe('R$ 9,90')
    expect(formatarValorBr(123456)).toBe('R$ 1.234,56')
    expect(formatarValorBr(100)).toBe('R$ 1,00')
  })
  it('formatarDataBr inverte ISO para dd/MM/yyyy', () => {
    expect(formatarDataBr('2026-07-15')).toBe('15/07/2026')
  })
})
