import { describe, it, expect } from 'vitest'
import { contratoClienteCanal } from '../contratos/canais'
import { FakeClienteCanal } from './canais'
import { StubClienteCanal } from '../stub_canais'

contratoClienteCanal('FakeClienteCanal', () => new FakeClienteCanal())
contratoClienteCanal('StubClienteCanal', () => new StubClienteCanal())

describe('StubClienteCanal', () => {
  it('falha como canal_nao_integrado (Permanente)', async () => {
    const r = await new StubClienteCanal().buscarPedidos()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('canal_nao_integrado')
  })
})
