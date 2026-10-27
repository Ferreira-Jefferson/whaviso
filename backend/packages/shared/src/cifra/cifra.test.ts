import { describe, it, expect } from 'vitest'
import { criarCifra, normalizarTelefoneBR, mascararTelefone, ErroCifra } from './index'

// MASTER_KEY de teste (min 32 chars), injetada sem env.
const MK = 'master-key-de-teste-para-o-kernel-0123456789'
const MK2 = 'outra-master-key-de-teste-9876543210-abcdef'

describe('criarCifra: round trip e seguranca da cifra', () => {
  it('PROVA api->zap: instancia A cifra, instancia B decifra com a MESMA MASTER_KEY', () => {
    const api = criarCifra(MK)
    const zap = criarCifra(MK)
    const token = Buffer.from('EAAG...token-de-negocio-da-meta', 'utf8')
    const cifrado = api.cifrar(token)
    expect(zap.decifrar(cifrado).equals(token)).toBe(true)
    expect(zap.decifrar(cifrado).toString('utf8')).toBe('EAAG...token-de-negocio-da-meta')
  })

  it('o cifrado NAO contem o texto claro (cifrado em repouso)', () => {
    const c = criarCifra(MK)
    const claro = 'TOKEN_SUPER_SECRETO_123'
    const cifrado = c.cifrar(Buffer.from(claro, 'utf8'))
    expect(cifrado.toString('utf8')).not.toContain(claro)
    expect(cifrado.toString('latin1')).not.toContain(claro)
  })

  it('nonce aleatorio: duas cifragens do mesmo claro diferem', () => {
    const c = criarCifra(MK)
    const claro = Buffer.from('igual', 'utf8')
    expect(c.cifrar(claro).equals(c.cifrar(claro))).toBe(false)
  })

  it('adulteracao (tag/ciphertext) falha ao decifrar', () => {
    const c = criarCifra(MK)
    const cifrado = c.cifrar(Buffer.from('intacto', 'utf8'))
    cifrado[cifrado.length - 1] = cifrado[cifrado.length - 1]! ^ 0xff
    expect(() => c.decifrar(cifrado)).toThrow(ErroCifra)
  })

  it('chave errada (outra MASTER_KEY) falha ao decifrar', () => {
    const cifrado = criarCifra(MK).cifrar(Buffer.from('segredo', 'utf8'))
    expect(() => criarCifra(MK2).decifrar(cifrado)).toThrow(ErroCifra)
  })

  it('versao desconhecida / malformado falha', () => {
    const c = criarCifra(MK)
    expect(() => c.decifrar(Buffer.from([0x02, 1, 2, 3]))).toThrow(ErroCifra)
    expect(() => c.decifrar(Buffer.alloc(4))).toThrow(ErroCifra)
  })

  it('MASTER_KEY curta e rejeitada', () => {
    expect(() => criarCifra('curta')).toThrow(ErroCifra)
    expect(() => criarCifra('x'.repeat(31))).toThrow(ErroCifra)
    expect(() => criarCifra('x'.repeat(32))).not.toThrow()
  })
})

describe('hashTelefone: estavel por numero, separado por dominio', () => {
  it('formatos equivalentes do mesmo numero geram o mesmo hash', () => {
    const c = criarCifra(MK)
    const a = c.hashTelefone('(11) 99999-9999')
    const b = c.hashTelefone('+5511999999999')
    const cc = c.hashTelefone('0055 11 99999 9999')
    expect(a).toBe(b)
    expect(a).toBe(cc)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('numeros diferentes geram hash diferente; MASTER_KEY diferente muda o hash', () => {
    const c = criarCifra(MK)
    expect(c.hashTelefone('+5511999999999')).not.toBe(c.hashTelefone('+5521988887777'))
    expect(criarCifra(MK2).hashTelefone('+5511999999999')).not.toBe(c.hashTelefone('+5511999999999'))
  })

  it('telefone invalido para hash lanca ErroCifra', () => {
    const c = criarCifra(MK)
    expect(() => c.hashTelefone('123')).toThrow(ErroCifra)
  })
})

describe('normalizarTelefoneBR e mascararTelefone', () => {
  it.each([
    ['(11) 99999-9999', '+5511999999999'],
    ['11999999999', '+5511999999999'],
    ['5511999999999', '+5511999999999'],
    ['+55 11 99999-9999', '+5511999999999'],
    ['0055 11 99999 9999', '+5511999999999'],
    ['(11) 3333-4444', '+551133334444'],
  ])('aceita %s', (entrada, esperado) => {
    expect(normalizarTelefoneBR(entrada)).toBe(esperado)
  })

  it.each(['', 'abc', '123', '(11) 8999-99999', '(01) 99999-9999', '(11) 29999-9999', '+1 415 555 2671', '11 0999-9999'])(
    'rejeita %s',
    (entrada) => {
      expect(normalizarTelefoneBR(entrada)).toBeNull()
    },
  )

  it('mascara so os 4 ultimos digitos', () => {
    expect(mascararTelefone('+5511999991234')).toBe('+55 ** *****-1234')
  })
})
