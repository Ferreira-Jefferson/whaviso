import { describe, it, expect } from 'vitest'
import { deltasAgregados, diffCasos, scoreDoResultado } from './metricas'
import type { EvalResumo } from './schemas'

const resumo = (o: Partial<EvalResumo> = {}): EvalResumo => ({
  total: 10, passou: 7, falhou: 2, erro: 1, scoreMedio: 0.7, porMetrica: { acerto: 0.8, fidelidade: 0.6 },
  tokensIn: 1000, tokensOut: 400, custoCentavos: 12, latenciaP50Ms: 500, latenciaP95Ms: 1500, ...o,
})

describe('scoreDoResultado', () => {
  it('media das metricas; null sem scores', () => {
    expect(scoreDoResultado({ a: 1, b: 0 })).toBe(0.5)
    expect(scoreDoResultado({})).toBeNull()
  })
})

describe('deltasAgregados (B menos A)', () => {
  it('subtrai cada campo', () => {
    const d = deltasAgregados(resumo(), resumo({
      passou: 9, falhou: 1, erro: 0, scoreMedio: 0.9, porMetrica: { acerto: 1, fidelidade: 0.5, nova: 1 },
      tokensIn: 1500, tokensOut: 300, custoCentavos: 10, latenciaP50Ms: 400, latenciaP95Ms: 1600,
    }))
    expect(d).toEqual({
      scoreMedio: 0.2, passou: 2, falhou: -1, erro: -1, porMetrica: { acerto: 0.2, fidelidade: -0.1 },
      tokensIn: 500, tokensOut: -100, custoCentavos: -2, latenciaP50Ms: -100, latenciaP95Ms: 100,
    })
  })
  it('lado sem resumo: inteiros contam zero, nullables viram null', () => {
    const d = deltasAgregados(null, resumo())
    expect(d.passou).toBe(7)
    expect(d.scoreMedio).toBeNull()
    expect(d.latenciaP50Ms).toBeNull()
    expect(d.porMetrica).toEqual({})
  })
})

describe('diffCasos', () => {
  const c1 = '11111111-1111-4111-8111-111111111111'
  const c2 = '22222222-2222-4222-8222-222222222222'
  const c3 = '33333333-3333-4333-8333-333333333333'
  const nomes = new Map([[c1, 'b caso'], [c2, 'a caso'], [c3, 'c caso']])

  it('casa por caso_id, marca mudancas, trata lado ausente e ignora resultado sem caso', () => {
    const a = [
      { caso_id: c1, status: 'passou' as const, scores: { s: 1 } },
      { caso_id: c2, status: 'falhou' as const, scores: { s: 0.2 } },
      { caso_id: null, status: 'passou' as const, scores: { s: 1 } },
    ]
    const b = [
      { caso_id: c1, status: 'passou' as const, scores: { s: 1 } },
      { caso_id: c2, status: 'passou' as const, scores: { s: 0.8 } },
      { caso_id: c3, status: 'erro' as const, scores: {} as Record<string, number> },
    ]
    const r = diffCasos(a, b, nomes)
    expect(r.map((x) => x.nome)).toEqual(['a caso', 'b caso', 'c caso'])
    expect(r[0]).toMatchObject({ caso_id: c2, statusA: 'falhou', statusB: 'passou', deltaScore: 0.6, mudou: true })
    expect(r[1]).toMatchObject({ caso_id: c1, deltaScore: 0, mudou: false })
    expect(r[2]).toMatchObject({ caso_id: c3, statusA: null, statusB: 'erro', deltaScore: null, mudou: true })
  })

  it('mesmo status mas score diferente conta como mudou', () => {
    const r = diffCasos(
      [{ caso_id: c1, status: 'passou', scores: { s: 0.5 } }],
      [{ caso_id: c1, status: 'passou', scores: { s: 0.9 } }],
      nomes,
    )
    expect(r[0]).toMatchObject({ deltaScore: 0.4, mudou: true })
  })
})
