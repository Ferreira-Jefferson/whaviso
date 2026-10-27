// Validador de dado vivo / PII / segredo na ingestao e no cache (RAG.md 3). Casos positivos (barram)
// e negativos (conhecimento estavel legitimo passa), como exige a historia do modulo.
import { describe, expect, it } from 'vitest'
import { podeCachear, validarConteudoConhecimento } from './validador'

describe('validarConteudoConhecimento: barra dado vivo / PII / segredo', () => {
  const barrados: Array<[string, string]> = [
    ['preco em reais', 'O X-Tudo custa R$ 32'],
    ['preco decimal', 'Sai por 12,90 reais'],
    ['temporal hoje', 'Temos promocao hoje'],
    ['temporal agora', 'Chega agora para voce'],
    ['disponibilidade esgotado', 'O suco esta esgotado'],
    ['disponibilidade disponivel', 'Esse item esta disponivel'],
    ['status de pedido', 'O status do pedido mudou'],
    ['telefone', 'Fale com a gente no 11 98888-7777'],
    ['pix', 'Pague no pix que agiliza'],
    ['segredo sk-', 'use a chave sk-abcdefgh12345678'],
  ]
  for (const [nome, texto] of barrados) {
    it(`barra: ${nome}`, () => {
      expect(validarConteudoConhecimento(texto).ok).toBe(false)
    })
  }

  const passam: string[] = [
    'O X-Tudo leva ovo e bacon, nao tem como tirar o ovo.',
    'Nao fazemos meia a meia em pizza.',
    'Aceitamos cartao e dinheiro na entrega.',
    'Fazemos entrega em toda a regiao central da cidade.',
    'O tempo medio de preparo e de quarenta minutos.',
  ]
  for (const texto of passam) {
    it(`passa: ${texto.slice(0, 24)}...`, () => {
      expect(validarConteudoConhecimento(texto).ok).toBe(true)
    })
  }

  it('devolve a categoria, nunca o trecho ofensor', () => {
    const r = validarConteudoConhecimento('custa R$ 32 e o pix e 11 98888-7777')
    expect(r.ok).toBe(false)
    expect(r.motivos).toContain('preco')
    expect(r.motivos).toContain('pix')
    expect(r.motivos.join(' ')).not.toContain('98888')
  })
})

describe('podeCachear: so pergunta e resposta estaveis', () => {
  it('pergunta e resposta estaveis podem ser cacheadas', () => {
    expect(podeCachear('voces fazem entrega?', 'Sim, fazemos entrega na regiao central.')).toBe(true)
  })
  it('resposta com preco nunca e cacheada', () => {
    expect(podeCachear('quanto custa o combo?', 'O combo custa R$ 40')).toBe(false)
  })
  it('resposta com disponibilidade nunca e cacheada', () => {
    expect(podeCachear('tem suco?', 'O suco esta esgotado hoje')).toBe(false)
  })
})
