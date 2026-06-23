import { describe, expect, it } from 'vitest'
import {
  extrairNumeroConvite,
  formatarNumeroConvite,
  gerarNumeroConvite,
  normalizarNumeroConvite,
  sha256ConviteHex,
} from './convite'

describe('número de convite (E2 H2.2)', () => {
  it('gera 6 dígitos (com zeros à esquerda quando preciso)', () => {
    expect(gerarNumeroConvite(() => 0)).toBe('000000')
    expect(gerarNumeroConvite(() => 0.0000123)).toBe('000012')
    expect(gerarNumeroConvite(() => 0.999999)).toBe('999999')
    for (let i = 0; i < 50; i++) {
      expect(gerarNumeroConvite()).toMatch(/^\d{6}$/)
    }
  })

  it('formata como xxx-xxx (hífen só visual)', () => {
    expect(formatarNumeroConvite('123456')).toBe('123-456')
    expect(formatarNumeroConvite('000012')).toBe('000-012')
  })

  it('normaliza corrido ou com hífen para a forma canônica de 6 dígitos', () => {
    expect(normalizarNumeroConvite('123456')).toBe('123456')
    expect(normalizarNumeroConvite('123-456')).toBe('123456')
    expect(normalizarNumeroConvite(' 123-456 ')).toBe('123456')
    // entradas inválidas
    expect(normalizarNumeroConvite('12345')).toBeNull()
    expect(normalizarNumeroConvite('1234567')).toBeNull()
    expect(normalizarNumeroConvite('abc')).toBeNull()
  })

  it('extrai o número de 6 dígitos de uma frase (E5 H5.1), com hífen ou corrido', () => {
    expect(extrairNumeroConvite('Oi, aqui é Maria, meu convite é o 123-456')).toBe('123456')
    expect(extrairNumeroConvite('123456')).toBe('123456')
    expect(extrairNumeroConvite('o número é 777 888 ok')).toBe('777888')
    // sem 6 dígitos -> null (fallback "pedir número")
    expect(extrairNumeroConvite('oi tudo bem?')).toBeNull()
    expect(extrairNumeroConvite('meu código é 1234')).toBeNull()
    // não recorta 6 de dentro de um número maior (ex.: telefone de 11 dígitos)
    expect(extrairNumeroConvite('meu zap é 11999998888')).toBeNull()
  })

  it('sha256ConviteHex é hex de 64 chars e determinístico', () => {
    const h = sha256ConviteHex('123456')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256ConviteHex('123456')).toBe(h)
    expect(sha256ConviteHex('654321')).not.toBe(h)
  })
})
