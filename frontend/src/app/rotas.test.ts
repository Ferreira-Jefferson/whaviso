import { describe, it, expect } from 'vitest'
import { ROTAS, podeVerRota } from './rotas'

const rota = (caminho: string) => {
  const r = ROTAS.find((x) => x.caminho === caminho)
  if (!r) throw new Error(`rota ${caminho} nao existe`)
  return r
}

describe('podeVerRota (gate de menu por permissao)', () => {
  it('rota sem gate aparece sempre, com qualquer grade', () => {
    const cozinha = rota('cozinha')
    expect(cozinha.permissao).toBeUndefined()
    expect(podeVerRota(cozinha, null)).toBe(true)
    expect(podeVerRota(cozinha, new Set())).toBe(true)
    expect(podeVerRota(cozinha, new Set(['qualquer:coisa']))).toBe(true)
  })

  it('rota com gate aparece enquanto a grade ainda nao chegou (granted null)', () => {
    expect(podeVerRota(rota('conversas'), null)).toBe(true)
  })

  it('rota com gate some quando o usuario nao tem a permissao', () => {
    expect(podeVerRota(rota('conversas'), new Set())).toBe(false)
    expect(podeVerRota(rota('conversas'), new Set(['pedidos:ver']))).toBe(false)
  })

  it('rota com gate aparece quando o usuario tem a permissao', () => {
    expect(rota('conversas').permissao).toBe('conversas:ver')
    expect(podeVerRota(rota('conversas'), new Set(['conversas:ver']))).toBe(true)
  })

  it('o mapeamento liga os modulos de atendimento as suas chaves :ver', () => {
    expect(rota('pessoas').permissao).toBe('pessoas:ver')
    expect(rota('canais').permissao).toBe('canais:ver')
    expect(rota('llm').permissao).toBe('ia:ver')
  })
})
