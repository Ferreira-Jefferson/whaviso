// O modulo clientes usa o kernel compartilhado via ./cripto (reexport de @whaviso/shared/cifra).
// Este teste guarda o contrato que o modulo depende; a bateria completa da cifra vive em
// packages/shared/src/cifra. Sem banco.
import { describe, it, expect } from 'vitest'
import { criarCifra, normalizarTelefoneBR, mascararTelefone } from './cripto'

const MK = 'master-key-de-teste-clientes-0123456789'

describe('clientes/cripto reexporta o kernel compartilhado', () => {
  it('normaliza formatos equivalentes para o mesmo E.164 e rejeita invalidos', () => {
    expect(normalizarTelefoneBR('(11) 99999-1234')).toBe('+5511999991234')
    expect(normalizarTelefoneBR('+55 11 99999 1234')).toBe('+5511999991234')
    expect(normalizarTelefoneBR('123')).toBeNull()
  })

  it('mascara so os 4 ultimos digitos', () => {
    expect(mascararTelefone('+5511999991234')).toBe('+55 ** *****-1234')
  })

  it('cifra: round trip do E.164, claro ausente do payload e hash estavel por numero', () => {
    const cifra = criarCifra(MK)
    const e164 = '+5511999991234'
    const cifrado = cifra.cifrar(Buffer.from(e164, 'utf8'))
    expect(cifrado.includes('999991234')).toBe(false)
    expect(cifra.decifrar(cifrado).toString('utf8')).toBe(e164)
    expect(cifra.hashTelefone('(11) 99999-1234')).toBe(cifra.hashTelefone(e164))
    expect(cifra.hashTelefone(e164)).toMatch(/^[0-9a-f]{64}$/)
  })
})
