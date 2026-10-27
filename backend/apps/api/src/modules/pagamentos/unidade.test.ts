// Testes de UNIDADE do módulo pagamentos (puros, sem banco): kernel do BR Code (gerar/validar
// + cidade), txid, cifra da chave Pix (sentinela de não vazamento) e validação da chave por tipo.
import { describe, it, expect } from 'vitest'
import { gerarPayloadPixCopiaCola, validarBrCode } from '@whaviso/shared/contracts'
import { LojaPixEntrada } from '@whaviso/shared/contracts'
import { candidatoTxid, sanitizarTxid, MAX_TENTATIVAS_TXID } from './txid'
import { criarCripto, ErroCifra } from './cripto'

const MK = 'master-key-de-teste-pagamentos-0123456789-ab'
const MK2 = 'outra-master-key-de-teste-pagamentos-fedcba'

describe('BR Code: geração + validação (kernel compartilhado)', () => {
  it('validarBrCode confere o CRC16 de um payload gerado', () => {
    const payload = gerarPayloadPixCopiaCola({
      chave: '123e4567-e12b-12d1-a456-426655440000',
      tipo: 'aleatoria',
      nomeTitular: 'Fulano de Tal',
      valorCentavos: 2599,
      identificador: 'PEDIDO123',
    })
    expect(validarBrCode(payload)).toBe(true)
  })

  it('validarBrCode rejeita payload corrompido (CRC não bate)', () => {
    const payload = gerarPayloadPixCopiaCola({ chave: 'x@x.com', tipo: 'email', nomeTitular: 'X' })
    const corrompido = payload.slice(0, -5) + 'Z' + payload.slice(-4)
    expect(validarBrCode(corrompido)).toBe(false)
    expect(validarBrCode('lixo')).toBe(false)
    expect(validarBrCode('')).toBe(false)
  })

  it('embute a cidade real da loja no campo 60 (sem acento, maiúscula, truncada a 15)', () => {
    const payload = gerarPayloadPixCopiaCola({
      chave: 'x@x.com',
      tipo: 'email',
      nomeTitular: 'X',
      cidade: 'São Paulo',
    })
    expect(payload).toContain('SAO PAULO')
    expect(validarBrCode(payload)).toBe(true)
  })

  it('sem cidade cai no placeholder fixo (compatibilidade com o gerador histórico)', () => {
    const payload = gerarPayloadPixCopiaCola({ chave: 'x@x.com', tipo: 'email', nomeTitular: 'X' })
    expect(payload).toContain('BRASIL')
  })

  it('valor em centavos vira reais.centavos no payload', () => {
    const payload = gerarPayloadPixCopiaCola({
      chave: 'x@x.com',
      tipo: 'email',
      nomeTitular: 'X',
      valorCentavos: 105090,
    })
    expect(payload).toContain('54071050.90')
  })
})

describe('txid', () => {
  it('sanitiza para alfanumérico maiúsculo, <= 25', () => {
    expect(sanitizarTxid('pedido #12/abc-xyz')).toBe('PEDIDO12ABCXYZ')
    expect(sanitizarTxid('a'.repeat(40))).toHaveLength(25)
    expect(sanitizarTxid('!!! ###')).toBe('')
  })

  it('candidato 0 = base; tentativas seguintes ganham sufixo distinto, sempre <= 25', () => {
    expect(candidatoTxid('PED-7', 0)).toBe('PED7')
    const c1 = candidatoTxid('PED-7', 1)
    const c2 = candidatoTxid('PED-7', 2)
    expect(c1).not.toBe('PED7')
    expect(c1).not.toBe(c2)
    for (let t = 0; t < MAX_TENTATIVAS_TXID; t++) {
      expect(candidatoTxid('x'.repeat(30), t).length).toBeLessThanOrEqual(25)
    }
  })

  it('código sem alfanumérico cai em PIX', () => {
    expect(candidatoTxid('###', 0)).toBe('PIX')
  })
})

describe('cifra da chave Pix (sentinela de não vazamento, SEC-023)', () => {
  it('round trip: decifra o que cifrou', () => {
    const c = criarCripto(MK)
    const chave = 'chave-pix-secreta-123e4567-e12b-12d1'
    const cifrado = c.cifrar(chave)
    expect(Buffer.isBuffer(cifrado)).toBe(true)
    expect(c.decifrar(cifrado)).toBe(chave)
  })

  it('o cifrado NÃO contém a chave em claro (cifra em repouso)', () => {
    const c = criarCripto(MK)
    const SENTINELA = 'SENTINELA_PIX_SUPER_SECRETA_987654'
    const cifrado = c.cifrar(SENTINELA)
    expect(cifrado.toString('utf8')).not.toContain(SENTINELA)
    expect(cifrado.toString('latin1')).not.toContain(SENTINELA)
  })

  it('nonce aleatório: duas cifragens da mesma chave diferem', () => {
    const c = criarCripto(MK)
    expect(c.cifrar('igual').equals(c.cifrar('igual'))).toBe(false)
  })

  it('MASTER_KEY errada falha ao decifrar (sem vazar)', () => {
    const cifrado = criarCripto(MK).cifrar('segredo')
    expect(() => criarCripto(MK2).decifrar(cifrado)).toThrow(ErroCifra)
  })
})

describe('LojaPixEntrada: validação da chave por tipo (SEC-081)', () => {
  const titular = 'Loja Teste'

  it('aceita CPF com dígito verificador válido e rejeita CPF inválido', () => {
    expect(LojaPixEntrada.safeParse({ tipo: 'cpf', chave: '111.444.777-35', titular }).success).toBe(true)
    expect(LojaPixEntrada.safeParse({ tipo: 'cpf', chave: '111.444.777-00', titular }).success).toBe(false)
    expect(LojaPixEntrada.safeParse({ tipo: 'cpf', chave: '00000000000', titular }).success).toBe(false)
  })

  it('aceita CNPJ válido e rejeita inválido', () => {
    expect(LojaPixEntrada.safeParse({ tipo: 'cnpj', chave: '11.222.333/0001-81', titular }).success).toBe(true)
    expect(LojaPixEntrada.safeParse({ tipo: 'cnpj', chave: '11.222.333/0001-00', titular }).success).toBe(false)
  })

  it('aceita e-mail, telefone E.164 e chave aleatória (UUID)', () => {
    expect(LojaPixEntrada.safeParse({ tipo: 'email', chave: 'loja@exemplo.com', titular }).success).toBe(true)
    expect(LojaPixEntrada.safeParse({ tipo: 'telefone', chave: '+5511999998888', titular }).success).toBe(true)
    expect(
      LojaPixEntrada.safeParse({
        tipo: 'aleatoria',
        chave: '123e4567-e12b-12d1-a456-426655440000',
        titular,
      }).success,
    ).toBe(true)
  })

  it('rejeita chave incoerente com o tipo e campo extra (strict)', () => {
    expect(LojaPixEntrada.safeParse({ tipo: 'email', chave: 'nao-eh-email', titular }).success).toBe(false)
    expect(LojaPixEntrada.safeParse({ tipo: 'aleatoria', chave: '12345', titular }).success).toBe(false)
    expect(
      LojaPixEntrada.safeParse({ tipo: 'email', chave: 'loja@exemplo.com', titular, loja_id: 'x' }).success,
    ).toBe(false)
  })
})
