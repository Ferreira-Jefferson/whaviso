import { describe, it, expect } from 'vitest'
import { EfeitoTool, EventoProposto, RespostaProposta } from './tool'

describe('EfeitoTool', () => {
  it('nao admite "efetivar" (isso e do motor)', () => {
    expect(EfeitoTool.safeParse('leitura').success).toBe(true)
    expect(EfeitoTool.safeParse('efetivar').success).toBe(false)
  })
})

describe('EventoProposto / RespostaProposta', () => {
  const chave = 'a'.repeat(64)
  it('exige chave de idempotencia e e strict', () => {
    expect(EventoProposto.safeParse({ tipo: 'rascunho_pedido', dados: {}, chave_idempotencia: chave }).success).toBe(true)
    expect(EventoProposto.safeParse({ tipo: 'x', dados: {} }).success).toBe(false)
    expect(EventoProposto.safeParse({ tipo: 'x', dados: {}, chave_idempotencia: chave, extra: 1 }).success).toBe(false)
  })
  it('resposta tem defaults vazios', () => {
    expect(RespostaProposta.parse({})).toEqual({ mensagens: [], eventos: [] })
  })
})
