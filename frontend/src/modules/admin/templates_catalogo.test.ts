import { describe, expect, it } from 'vitest'
import { paraIndexado, paraNomeado, variaveisDoCorpo } from './templates_catalogo'

describe('paraNomeado (inverso de paraIndexado)', () => {
  it('reconverte {{n}} para o token nomeado usando a ordem de variaveis', () => {
    const variaveis = ['nome_devedor', 'valor']
    expect(paraNomeado('Oi {{1}}, o valor é {{2}}.', variaveis)).toBe(
      'Oi {{NOME_DEVEDOR}}, o valor é {{VALOR}}.',
    )
  })

  it('faz round-trip com paraIndexado (nomeado -> indexado -> nomeado)', () => {
    const corpo = 'Oi {{NOME_DEVEDOR}}, {{NOME_COBRADOR}} pediu {{VALOR}} por {{MOTIVO}}.'
    const variaveis = variaveisDoCorpo(corpo)
    const indexado = paraIndexado(corpo, variaveis)
    expect(indexado).toBe('Oi {{1}}, {{2}} pediu {{3}} por {{4}}.')
    expect(paraNomeado(indexado, variaveis)).toBe(corpo)
  })

  it('preserva índices sem chave correspondente e chaves fora do catálogo', () => {
    expect(paraNomeado('vazio {{5}}', ['nome_devedor'])).toBe('vazio {{5}}')
    expect(paraNomeado('desconhecida {{1}}', ['inexistente'])).toBe('desconhecida {{1}}')
  })
})
