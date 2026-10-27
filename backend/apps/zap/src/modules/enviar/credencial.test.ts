import { describe, expect, it } from 'vitest'
import { criarCifra } from '@whaviso/shared/cifra'
import { resolverDestino, resolverNumero } from './credencial'

const MASTER_KEY = 'chave-mestra-de-teste-com-32-caracteres-ok'
const cifra = criarCifra(MASTER_KEY)

describe('resolver credencial do numero (decifra do token)', () => {
  it('round-trip: o token cifrado pela api volta identico dentro da CredencialResolvida', () => {
    const token = 'EAAG-token-do-system-user-123'
    const tokenCifrado = cifra.cifrar(Buffer.from(token, 'utf8'))
    const numero = resolverNumero(
      { phone_number_id: '100200300', token_cifrado: tokenCifrado, status: 'conectado' },
      cifra,
    )
    expect(numero).not.toBeNull()
    expect(numero!.phoneNumberId).toBe('100200300')
    // So revelar() devolve o segredo; serializacao nunca o expoe (SEC-024/SEC-026).
    expect(numero!.credencial.revelar()).toBe(token)
    expect(JSON.stringify(numero!.credencial)).not.toContain(token)
    expect(String(numero!.credencial)).not.toContain(token)
  })

  it('numero sem token -> null (chamador trata como credencial invalida)', () => {
    expect(
      resolverNumero({ phone_number_id: '1', token_cifrado: null, status: 'pausado' }, cifra),
    ).toBeNull()
  })

  it('destino: telefone cifrado volta em E.164; ausente -> null', () => {
    const e164 = '+5511988887777'
    const cifrado = cifra.cifrar(Buffer.from(e164, 'utf8'))
    expect(resolverDestino(cifrado, cifra)).toBe(e164)
    expect(resolverDestino(null, cifra)).toBeNull()
  })
})
