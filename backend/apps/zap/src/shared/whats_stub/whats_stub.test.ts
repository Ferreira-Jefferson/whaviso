import { describe, expect, it, vi } from 'vitest'
import { CredencialResolvida } from '@whaviso/shared/clientes'
import { contratoClienteWhats } from '@whaviso/shared/clientes/testing'
import { criarWhatsStub } from './index'

contratoClienteWhats('whats_stub', () => {
  const s = criarWhatsStub()
  return { cliente: s, assinar: (c) => s.assinar(c) }
})

describe('whats_stub (SEC-024)', () => {
  it('nao loga nem repassa telefone, token ou texto ao console/log', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    const log = vi.fn()
    const s = criarWhatsStub({ log })
    await s.enviarTexto({
      numero: { phoneNumberId: '99', credencial: new CredencialResolvida('token-secreto') },
      para: '+5511999998888',
      texto: 'conteudo privado',
    })
    const visto = JSON.stringify(log.mock.calls)
    for (const proibido of ['5511999998888', 'token-secreto', 'conteudo privado']) {
      expect(visto).not.toContain(proibido)
    }
    expect(log).toHaveBeenCalledWith('whats_stub_envio', { operacao: 'enviarTexto', wamid: 'wamid.stub.1' })
    for (const e of espioes) {
      expect(e).not.toHaveBeenCalled()
      e.mockRestore()
    }
  })
})
