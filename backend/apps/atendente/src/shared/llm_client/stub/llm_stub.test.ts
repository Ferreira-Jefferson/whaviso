import { describe, expect, it } from 'vitest'
import { CredencialResolvida } from '@whaviso/shared/clientes'
import { contratoClienteLLM } from '@whaviso/shared/clientes/testing'
import { criarLlmStub } from './index'

contratoClienteLLM('llm_client stub', () => {
  const s = criarLlmStub()
  return { cliente: s, requisicoes: () => s.requisicoes }
})

describe('llm_client stub', () => {
  it('resposta enlatada por chave de cenario, com padrao', async () => {
    const s = criarLlmStub({ cenarios: { cardapio: { texto: 'temos pizza' } } })
    const credencial = new CredencialResolvida('k')
    const mensagens = [{ papel: 'user' as const, conteudo: 'oi' }]
    const a = await s.completar({ credencial, mensagens, chaveCenario: 'cardapio' })
    const b = await s.completar({ credencial, mensagens })
    expect(a.ok && a.valor.texto).toBe('temos pizza')
    expect(b.ok && b.valor.texto).toBe('resposta-stub')
  })
})
