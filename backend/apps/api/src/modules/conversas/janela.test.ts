// Unidade: janela de 24h (funcao pura), cursor e schemas.
import { describe, it, expect } from 'vitest'
import { janela24h, JANELA_MS } from './janela'
import { codificarCursor, decodificarCursor } from './cursor'
import { MensagemEnviarEntrada, ConversaListaItem } from './schemas'

const horas = (h: number) => h * 60 * 60 * 1000

describe('janela24h (funcao pura)', () => {
  const agora = new Date('2026-10-27T12:00:00.000Z')
  it('sem entrada = fechada', () => {
    expect(janela24h(null, agora)).toEqual({ janela_aberta: false, janela_aberta_ate: null, janela_restante_segundos: 0 })
  })
  it('aberta com tempo restante', () => {
    const j = janela24h(new Date(agora.getTime() - horas(23)), agora)
    expect(j.janela_aberta).toBe(true)
    expect(j.janela_restante_segundos).toBe(3600)
    expect(j.janela_aberta_ate).toBe(new Date(agora.getTime() + horas(1)).toISOString())
  })
  it('borda: exatamente 24h = fechada; 1ms antes = aberta', () => {
    expect(janela24h(new Date(agora.getTime() - JANELA_MS), agora).janela_aberta).toBe(false)
    expect(janela24h(new Date(agora.getTime() - JANELA_MS + 1), agora).janela_aberta).toBe(true)
  })
  it('fechada ha dias: restante 0', () => {
    expect(janela24h(new Date(agora.getTime() - horas(72)), agora).janela_restante_segundos).toBe(0)
  })
})

describe('cursor e schemas', () => {
  it('cursor ida e volta; lixo vira cursor_invalido', () => {
    const p = { instante: '2026-10-27T12:00:00.123456Z', id: '11111111-1111-4111-8111-111111111111' }
    expect(decodificarCursor(codificarCursor(p))).toEqual(p)
    expect(() => decodificarCursor('lixo')).toThrow()
  })
  it('entrada de mensagem: texto limitado, sem chaves extras', () => {
    expect(MensagemEnviarEntrada.safeParse({ texto: 'oi' }).success).toBe(true)
    expect(MensagemEnviarEntrada.safeParse({ texto: '' }).success).toBe(false)
    expect(MensagemEnviarEntrada.safeParse({ texto: 'x'.repeat(4097) }).success).toBe(false)
    expect(MensagemEnviarEntrada.safeParse({ texto: 'oi', loja_id: 'x' }).success).toBe(false)
  })
  it('item de lista nao aceita telefone', () => {
    expect(ConversaListaItem.safeParse({ telefone: '+5511999998888' }).success).toBe(false)
  })
})
