// Unidade: normalizacao de Pix/placa e hash (sem banco).
import { describe, expect, it } from 'vitest'
import { criarCifra } from '@whaviso/shared/cifra'
import { hashPix, normalizarPix, normalizarPlaca, ultimos4 } from './protecao'

const cifra = criarCifra('master-key-de-teste-motoboys-0123456789')

describe('normalizarPlaca', () => {
  it('aceita formato antigo e Mercosul, em maiuscula e sem separador', () => {
    expect(normalizarPlaca('abc-1234')).toBe('ABC1234')
    expect(normalizarPlaca('bra 2e19')).toBe('BRA2E19')
  })
  it('rejeita formato invalido', () => {
    expect(normalizarPlaca('AB12345')).toBeNull()
    expect(normalizarPlaca('1234ABC')).toBeNull()
  })
})

describe('normalizarPix', () => {
  it('cpf/cnpj: so digitos com o tamanho do tipo', () => {
    expect(normalizarPix('cpf', '529.982.247-25', cifra)).toBe('52998224725')
    expect(normalizarPix('cpf', '123', cifra)).toBeNull()
    expect(normalizarPix('cnpj', '11.222.333/0001-81', cifra)).toBe('11222333000181')
  })
  it('email minusculo, telefone E.164, aleatoria UUID', () => {
    expect(normalizarPix('email', ' Fulano@Ex.COM ', cifra)).toBe('fulano@ex.com')
    expect(normalizarPix('email', 'sem-arroba', cifra)).toBeNull()
    expect(normalizarPix('telefone', '(11) 98765-4321', cifra)).toBe('+5511987654321')
    expect(normalizarPix('aleatoria', '123E4567-E89B-12D3-A456-426614174000', cifra))
      .toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(normalizarPix('aleatoria', 'xyz', cifra)).toBeNull()
  })
})

describe('hashPix', () => {
  it('sha256 hex (64), determinista e dependente do tipo', () => {
    const h = hashPix('cpf', '52998224725')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashPix('cpf', '52998224725')).toBe(h)
    expect(hashPix('telefone', '52998224725')).not.toBe(h)
  })
  it('ultimos4 so expoe 4 caracteres', () => {
    expect(ultimos4('52998224725')).toBe('4725')
  })
})
