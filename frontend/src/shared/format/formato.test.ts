import { describe, expect, it } from 'vitest'
import { formatarCentavos, diaSaoPaulo, formatarData, formatarHora, formatarDataHora } from './index'

describe('formatarCentavos', () => {
  it('formata BRL', () => {
    expect(formatarCentavos(1999)).toBe('R$ 19,99')
    expect(formatarCentavos(0)).toBe('R$ 0,00')
    expect(formatarCentavos(123456789)).toBe('R$ 1.234.567,89')
    expect(formatarCentavos(-500)).toBe('-R$ 5,00')
  })
  it('rejeita nao inteiro', () => {
    expect(() => formatarCentavos(10.5)).toThrow(RangeError)
  })
})

describe('datas em America/Sao_Paulo', () => {
  it('converte UTC para o fuso (UTC-3)', () => {
    expect(formatarDataHora('2026-03-10T15:30:00Z')).toBe('10/03/2026 12:30')
  })
  it('virada de dia: 02:30Z ainda e o dia anterior em SP', () => {
    expect(diaSaoPaulo('2026-03-10T02:30:00Z')).toBe('2026-03-09')
    expect(formatarData('2026-03-10T02:30:00Z')).toBe('09/03/2026')
    expect(formatarHora('2026-03-10T02:30:00Z')).toBe('23:30')
  })
  it('horario de verao historico (UTC-2) em janeiro de 2018', () => {
    expect(formatarHora('2018-01-10T12:00:00Z')).toBe('10:00')
    expect(formatarHora('2018-07-10T12:00:00Z')).toBe('09:00')
  })
  it('aceita offset no ISO', () => {
    expect(formatarHora('2026-03-10T12:00:00-03:00')).toBe('12:00')
  })
  it('rejeita data invalida', () => {
    expect(() => formatarData('lixo')).toThrow(RangeError)
  })
})

import { telefoneBrParaE164 } from './index'

describe('telefoneBrParaE164', () => {
  it('normaliza formatos comuns', () => {
    expect(telefoneBrParaE164('(12) 99999-8888')).toBe('+5512999998888')
    expect(telefoneBrParaE164('+55 12 99999-8888')).toBe('+5512999998888')
    expect(telefoneBrParaE164('1233334444')).toBe('+551233334444')
  })
  it('rejeita invalidos', () => {
    expect(telefoneBrParaE164('999')).toBeNull()
    expect(telefoneBrParaE164('(12) 89999-8888')).toBeNull()
    expect(telefoneBrParaE164('')).toBeNull()
  })
})
