// Chunking por unidade logica (RAG.md 2): blocos por linha em branco; prosa longa quebra por frases.
import { describe, expect, it } from 'vitest'
import { chunkPorUnidadeLogica } from './chunking'

describe('chunkPorUnidadeLogica', () => {
  it('FAQ: cada par P/R (bloco) vira um chunk, inteiro', () => {
    const conteudo = 'Tem estacionamento? Sim, gratuito ao lado.\n\nE picante? So o molho da casa.'
    const chunks = chunkPorUnidadeLogica({ tipo: 'faq', conteudo })
    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.texto).toContain('estacionamento')
    expect(chunks[1]!.texto).toContain('picante')
    expect(chunks.map((c) => c.ordem)).toEqual([0, 1])
  })

  it('regra: blocos curtos independentes viram chunks separados', () => {
    const conteudo = 'Nao fazemos meia a meia.\n\nTempo medio de quarenta minutos.\n\nTroco informado no pedido.'
    const chunks = chunkPorUnidadeLogica({ tipo: 'regra', conteudo })
    expect(chunks).toHaveLength(3)
  })

  it('prosa longa quebra em janelas de ate 4 frases', () => {
    const frases = Array.from({ length: 6 }, (_, i) => `Frase numero ${i + 1}.`).join(' ')
    const chunks = chunkPorUnidadeLogica({ tipo: 'descricao', conteudo: frases })
    expect(chunks).toHaveLength(2) // 4 + 2
    expect(chunks[0]!.texto.match(/Frase/g)).toHaveLength(4)
    expect(chunks[1]!.texto.match(/Frase/g)).toHaveLength(2)
  })

  it('ignora blocos vazios e normaliza espacos', () => {
    const chunks = chunkPorUnidadeLogica({ tipo: 'regra', conteudo: '  Uma   regra.  \n\n\n\n   ' })
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.texto).toBe('Uma regra.')
  })
})
