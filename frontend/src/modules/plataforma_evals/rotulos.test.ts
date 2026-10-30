import { describe, expect, it } from 'vitest'
import { FORM_VAZIO, montarPayload } from './components/casoForm'
import { deltaPp, emAndamento, pct, reais, tomDelta } from './rotulos'

describe('formatadores da Central de Evals', () => {
  it('score e razao 0..1 em percentual; null e sem dado', () => {
    expect(pct(0.875)).toBe('87,5%')
    expect(pct(null)).toBe('Sem dado')
  })
  it('delta de score em pontos percentuais com sinal', () => {
    expect(deltaPp(0.05)).toBe('+5 pp')
    expect(deltaPp(-0.025)).toBe('-2,5 pp')
  })
  it('custo em reais a partir de centavos', () => {
    expect(reais(1250)).toBe('R$ 12,50')
  })
  it('tom do delta respeita se maior e melhor', () => {
    expect(tomDelta(0.1, true)).toBe('sucesso')
    expect(tomDelta(100, false)).toBe('erro')
    expect(tomDelta(0)).toBe('neutro')
  })
  it('fila e rodando reconsultam; estados finais nao', () => {
    expect(emAndamento('fila')).toBe(true)
    expect(emAndamento('rodando')).toBe(true)
    expect(emAndamento('concluida')).toBe(false)
  })
})

describe('montarPayload (formulario de caso por tipo)', () => {
  it('nlu: exige o tipo esperado e enxuga opcionais vazios', () => {
    const ok = montarPayload('nlu_intencao', { ...FORM_VAZIO, nome: 'c1', texto: 'quero uma pizza', nluTipo: 'pedido' })
    expect(ok).toMatchObject({ ok: true, entrada: { texto: 'quero uma pizza' }, esperado: { tipo: 'pedido' } })
    const ruim = montarPayload('nlu_intencao', { ...FORM_VAZIO, nome: 'c1', texto: 'oi' })
    expect(ruim.ok).toBe(false)
  })
  it('harness: historico exige "autor: texto"', () => {
    const base = { ...FORM_VAZIO, nome: 'c2', texto: 'oi' }
    expect(montarPayload('harness_turno', { ...base, historico: 'sem separador' }).ok).toBe(false)
    expect(montarPayload('harness_turno', { ...base, historico: 'cliente: oi\natendente: ola' })).toMatchObject({
      ok: true,
      entrada: { historico: [{ autor: 'cliente', texto: 'oi' }, { autor: 'atendente', texto: 'ola' }] },
    })
  })
  it('recusa nome vazio e peso invalido', () => {
    expect(montarPayload('rag_faithfulness', { ...FORM_VAZIO, consulta: 'x' }).ok).toBe(false)
    expect(montarPayload('rag_faithfulness', { ...FORM_VAZIO, nome: 'n', consulta: 'x', peso: '0' }).ok).toBe(false)
    expect(montarPayload('rag_faithfulness', { ...FORM_VAZIO, nome: 'n', consulta: 'x' }).ok).toBe(true)
  })
})
