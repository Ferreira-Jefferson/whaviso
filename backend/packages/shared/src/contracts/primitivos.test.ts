import { describe, it, expect } from 'vitest'
import { Centavos, UuidSchema, DataHoraIso, TelefoneE164, Paginacao, ErroApi } from './primitivos'

describe('Centavos', () => {
  it('aceita inteiro não negativo', () => {
    expect(Centavos.parse(0)).toBe(0)
    expect(Centavos.parse(1990)).toBe(1990)
  })
  it('rejeita negativo, float e acima do teto', () => {
    expect(Centavos.safeParse(-1).success).toBe(false)
    expect(Centavos.safeParse(10.5).success).toBe(false)
    expect(Centavos.safeParse(1_000_000_001).success).toBe(false)
  })
})

describe('UuidSchema', () => {
  it('aceita uuid válido e rejeita o resto', () => {
    expect(UuidSchema.safeParse('3f2504e0-4f89-41d3-9a0c-0305e82c3301').success).toBe(true)
    expect(UuidSchema.safeParse('não-uuid').success).toBe(false)
  })
})

describe('DataHoraIso', () => {
  it('aceita ISO com offset e rejeita data solta', () => {
    expect(DataHoraIso.safeParse('2026-10-27T12:00:00Z').success).toBe(true)
    expect(DataHoraIso.safeParse('2026-10-27').success).toBe(false)
  })
})

describe('TelefoneE164', () => {
  it('exige o + e dígitos E.164', () => {
    expect(TelefoneE164.safeParse('+5511999998888').success).toBe(true)
    expect(TelefoneE164.safeParse('11999998888').success).toBe(false)
  })
})

describe('Paginacao', () => {
  it('aplica limite padrão e rejeita chave desconhecida (strict)', () => {
    expect(Paginacao.parse({}).limite).toBe(20)
    expect(Paginacao.safeParse({ limite: 5, foo: 1 }).success).toBe(false)
  })
  it('barra limite acima de 100', () => {
    expect(Paginacao.safeParse({ limite: 101 }).success).toBe(false)
  })
})

describe('ErroApi', () => {
  it('exige envelope { error: { code, message } } estrito', () => {
    expect(ErroApi.safeParse({ error: { code: 'x', message: 'y' } }).success).toBe(true)
    expect(ErroApi.safeParse({ error: { code: 'x' } }).success).toBe(false)
    expect(ErroApi.safeParse({ error: { code: 'x', message: 'y', extra: 1 } }).success).toBe(false)
  })
})
