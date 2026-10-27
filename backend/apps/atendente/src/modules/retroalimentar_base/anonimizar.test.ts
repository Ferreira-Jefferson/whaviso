// Anonimizacao (SEC-024): PII do cliente nunca segue para o LLM nem para o rascunho. Funcao pura, sem
// banco, roda sempre.
import { describe, expect, it } from 'vitest'
import { anonimizar } from './anonimizar'
import { assinatura, hashConteudo, jaccard, normalizar, tokens } from './texto'

describe('anonimizar', () => {
  it('mascara nome do cliente conhecido onde aparecer', () => {
    const out = anonimizar('O Joao Silva pediu sem cebola', { nomeCliente: 'Joao Silva' })
    expect(out).not.toMatch(/joao/i)
    expect(out).not.toMatch(/silva/i)
    expect(out).toContain('[cliente]')
    expect(out.toLowerCase()).toContain('sem cebola')
  })

  it('mascara telefone em formatos variados', () => {
    for (const tel of ['11988887777', '(11) 98888-7777', '+55 11 98888 7777', '11 8888-7777']) {
      const out = anonimizar(`me liga no ${tel} por favor`)
      expect(out).not.toMatch(/\d{4}/)
      expect(out).toContain('[telefone]')
    }
  })

  it('mascara email, CEP, numero de endereco e logradouro conhecido', () => {
    const out = anonimizar('entrega na Rua das Flores, 123, cep 01310-100, email a@b.com', {
      logradouros: ['Rua das Flores'],
    })
    expect(out).toContain('[endereco]')
    expect(out).toContain('[cep]')
    expect(out).toContain('[email]')
    expect(out).not.toMatch(/flores/i)
    expect(out).not.toMatch(/01310/)
  })

  it('mascara sequencia cara de chave/token', () => {
    const chave = 'sk-' + 'a1b2c3d4'.repeat(6)
    const out = anonimizar(`a chave e ${chave}`)
    expect(out).toContain('[omitido]')
    expect(out).not.toContain(chave)
  })

  it('texto vazio ou sem PII passa limpo', () => {
    expect(anonimizar('')).toBe('')
    expect(anonimizar('voces fazem entrega aos domingos?')).toBe('voces fazem entrega aos domingos?')
  })
})

describe('texto (dedup e recorrencia)', () => {
  it('normaliza acento, caixa e pontuacao', () => {
    expect(normalizar('Vocês ABREM, aos Domingos?')).toBe('voces abrem aos domingos')
  })

  it('hash estavel e no formato de documentos.hash_conteudo', () => {
    const h = hashConteudo('Abrem aos domingos.')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).toBe(hashConteudo('abrem   aos domingos'))
  })

  it('assinatura agrupa perguntas quase iguais e ignora stopwords', () => {
    expect(assinatura('voces fazem entrega?')).toBe(assinatura('fazem entrega voces'))
    expect(tokens('a de o entrega').has('entrega')).toBe(true)
    expect(tokens('a de o').size).toBe(0)
  })

  it('jaccard alto para textos muito parecidos, baixo para distintos', () => {
    expect(jaccard('voces fazem entrega aos domingos', 'fazem entrega aos domingos voces')).toBeGreaterThan(0.8)
    expect(jaccard('voces fazem entrega', 'qual o horario de funcionamento')).toBeLessThan(0.2)
  })
})
