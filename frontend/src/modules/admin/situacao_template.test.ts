import { describe, expect, it } from 'vitest'
import { situacaoTemplate } from './situacao_template'

describe('situacaoTemplate', () => {
  it('aprovado: veredito da Meta vence, independente de submissão', () => {
    expect(situacaoTemplate({ status_meta: 'aprovado', meta_submetido_em: new Date() })).toBe(
      'aprovado',
    )
    expect(situacaoTemplate({ status_meta: 'aprovado', meta_submetido_em: null })).toBe('aprovado')
  })

  it('rejeitado: veredito da Meta vence', () => {
    expect(situacaoTemplate({ status_meta: 'rejeitado', meta_submetido_em: new Date() })).toBe(
      'rejeitado',
    )
  })

  it('pendente + submetido = em análise na Meta', () => {
    expect(situacaoTemplate({ status_meta: 'pendente', meta_submetido_em: new Date() })).toBe(
      'em_analise',
    )
  })

  it('pendente sem submissão = rascunho (não enviado à Meta)', () => {
    expect(situacaoTemplate({ status_meta: 'pendente', meta_submetido_em: null })).toBe('rascunho')
  })
})
