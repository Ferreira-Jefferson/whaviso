// Matematica do resumo da execucao (puro, sem banco).
import { describe, expect, it } from 'vitest'
import { montarResumo, percentil } from './resumo'
import type { ResultadoCaso } from './tipos'

const r = (o: Partial<ResultadoCaso>): ResultadoCaso => ({
  casoId: 'c',
  status: 'passou',
  scores: {},
  principal: 1,
  peso: 1,
  saida: null,
  metricas: { tokensIn: 0, tokensOut: 0, custoCentavos: 0 },
  erro: null,
  ...o,
})

describe('percentil', () => {
  it('interpola e devolve null sem dados', () => {
    expect(percentil([], 0.5)).toBeNull()
    expect(percentil([10], 0.95)).toBe(10)
    expect(percentil([10, 20, 30, 40], 0.5)).toBe(25)
    expect(percentil([100, 200, 300, 400, 500], 0.95)).toBe(480)
  })
})

describe('montarResumo', () => {
  it('conta status, soma tokens/custo, media por metrica e exclui erro do scoreMedio', () => {
    const resumo = montarResumo([
      r({ status: 'passou', scores: { a: 1, b: 0.5 }, principal: 1, metricas: { tokensIn: 10, tokensOut: 5, custoCentavos: 2, latenciaMs: 100 } }),
      r({ status: 'falhou', scores: { a: 0 }, principal: 0, metricas: { tokensIn: 20, tokensOut: 5, custoCentavos: 3, latenciaMs: 300 } }),
      r({ status: 'erro', scores: {}, principal: null, erro: 'llm_indisponivel', metricas: null }),
    ])
    expect(resumo).toMatchObject({ total: 3, passou: 1, falhou: 1, erro: 1, scoreMedio: 0.5, tokensIn: 30, tokensOut: 10, custoCentavos: 5 })
    expect(resumo.porMetrica).toEqual({ a: 0.5, b: 0.5 })
    expect(resumo.latenciaP50Ms).toBe(200)
    expect(resumo.latenciaP95Ms).toBe(290)
  })

  it('pondera o scoreMedio pelo peso e mescla metricas extras (hitAtK)', () => {
    const resumo = montarResumo(
      [r({ principal: 1, peso: 3 }), r({ status: 'falhou', principal: 0, peso: 1 })],
      { hitAtK: 0.75, contextRecall: 0.6 },
    )
    expect(resumo.scoreMedio).toBe(0.75)
    expect(resumo.porMetrica).toMatchObject({ hitAtK: 0.75, contextRecall: 0.6 })
  })

  it('sem resultados pontuaveis: scoreMedio e latencias nulos (recuperacao pura)', () => {
    const resumo = montarResumo([r({ status: 'erro', principal: null, metricas: null })])
    expect(resumo.scoreMedio).toBeNull()
    expect(resumo.latenciaP50Ms).toBeNull()
    expect(resumo.latenciaP95Ms).toBeNull()
  })
})
