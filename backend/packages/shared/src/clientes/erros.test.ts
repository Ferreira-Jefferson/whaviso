import { describe, it, expect } from 'vitest'
import {
  CredencialResolvida,
  ErroSsrf,
  JanelaExpirada,
  Permanente,
  POLITICA_WHATS,
  RateLimit,
  Transitorio,
  TemplateNaoAprovado,
  atrasoRetry,
  hostPermitido,
  ok,
  falha,
  proximoRetry,
} from './erros'

describe('erros tipados', () => {
  it('classifica retentabilidade', () => {
    expect(new JanelaExpirada().retentavel).toBe(false)
    expect(new TemplateNaoAprovado().retentavel).toBe(false)
    expect(new Permanente().retentavel).toBe(false)
    expect(new Transitorio().retentavel).toBe(true)
    expect(new RateLimit().retentavel).toBe(true)
    expect(new ErroSsrf('x').tipo).toBe('Permanente')
  })
  it('Resultado', () => {
    expect(ok(1)).toEqual({ ok: true, valor: 1 })
    expect(falha('e')).toEqual({ ok: false, erro: 'e' })
  })
})

describe('retry como dado', () => {
  const p = { ...POLITICA_WHATS.retry, jitter: 0 }
  it('backoff exponencial limitado por maxMs', () => {
    expect(atrasoRetry(p, 1)).toBe(1000)
    expect(atrasoRetry(p, 3)).toBe(4000)
    expect(atrasoRetry(p, 20)).toBe(p.maxMs)
  })
  it('nao tenta erro permanente nem estourando tentativas', () => {
    expect(proximoRetry(p, new Permanente(), 1).tentar).toBe(false)
    expect(proximoRetry(p, new Transitorio(), p.maxTentativas).tentar).toBe(false)
    expect(proximoRetry(p, new Transitorio(), 1)).toEqual({ tentar: true, atrasoMs: 1000 })
  })
  it('RateLimit respeita retryAposMs', () => {
    expect(proximoRetry(p, new RateLimit('x', 7000), 1).atrasoMs).toBe(7000)
  })
})

describe('hostPermitido', () => {
  it('exato e curinga', () => {
    expect(hostPermitido('graph.facebook.com', ['graph.facebook.com'])).toBe(true)
    expect(hostPermitido('a.openrouter.ai', ['*.openrouter.ai'])).toBe(true)
    expect(hostPermitido('openrouter.ai', ['*.openrouter.ai'])).toBe(false)
    expect(hostPermitido('evilopenrouter.ai', ['*.openrouter.ai'])).toBe(false)
    expect(hostPermitido('x.com', ['graph.facebook.com'])).toBe(false)
  })
})

describe('CredencialResolvida', () => {
  it('nao vaza por serializacao', () => {
    const c = new CredencialResolvida('segredo-123')
    expect(JSON.stringify({ c })).not.toContain('segredo-123')
    expect(`${c}`).not.toContain('segredo-123')
    expect(c.revelar()).toBe('segredo-123')
  })
})
