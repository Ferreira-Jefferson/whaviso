import { describe, it, expect, vi } from 'vitest'
import { CredencialResolvida, JanelaExpirada, Transitorio } from '../erros'
import { contratoClienteLLM } from '../contratos/llm'
import { contratoClienteMapas } from '../contratos/mapas'
import { contratoClienteWhats } from '../contratos/whats'
import { montarRequisicaoLlm } from '../llm'
import { FakeClienteLLM } from './llm'
import { FakeClienteMapas } from './mapas'
import { FakeClienteWhats } from './whats'

contratoClienteWhats('FakeClienteWhats', () => {
  const f = new FakeClienteWhats()
  return { cliente: f, assinar: (c) => f.assinar(c) }
})

contratoClienteLLM('FakeClienteLLM', () => {
  const f = new FakeClienteLLM()
  return { cliente: f, requisicoes: () => f.requisicoes }
})

contratoClienteMapas('FakeClienteMapas', () => new FakeClienteMapas({ padrao: { lat: -23.55, lng: -46.63 } }))

const numero = { phoneNumberId: '1', credencial: new CredencialResolvida('c') }
const para = '+5511999998888'

describe('FakeClienteWhats', () => {
  it('grava chamadas e programa falha por indice', async () => {
    const f = new FakeClienteWhats().falharNaChamada(1, new JanelaExpirada())
    const a = await f.enviarTexto({ numero, para, texto: 'a' })
    const b = await f.enviarTexto({ numero, para, texto: 'b' })
    const c = await f.enviarTexto({ numero, para, texto: 'c' })
    expect(a.ok).toBe(true)
    expect(!b.ok && b.erro.tipo).toBe('JanelaExpirada')
    expect(c.ok).toBe(true)
    expect(f.chamadas.map((x) => x.operacao)).toEqual(['enviarTexto', 'enviarTexto', 'enviarTexto'])
  })
  it('falharSempre ate limpar', async () => {
    const f = new FakeClienteWhats().falharSempre(new Transitorio())
    expect((await f.marcarLida({ numero, wamid: 'w' })).ok).toBe(false)
    f.limpar()
    expect((await f.marcarLida({ numero, wamid: 'w' })).ok).toBe(true)
  })
})

describe('FakeClienteLLM', () => {
  const credencial = new CredencialResolvida('s')
  it('resposta enlatada por chave de cenario e deterministica', async () => {
    const f = new FakeClienteLLM().cenario('pedido', { texto: 'ok pedido' })
    const m = [{ papel: 'user' as const, conteudo: 'x' }]
    const a = await f.completar({ credencial, mensagens: m, chaveCenario: 'pedido' })
    const b = await f.completar({ credencial, mensagens: m })
    expect(a.ok && a.valor.texto).toBe('ok pedido')
    expect(b.ok && b.valor.texto).toBe('resposta-fake')
    const e1 = await f.embutir({ credencial, textos: ['abc'] })
    const e2 = await f.embutir({ credencial, textos: ['abc'] })
    expect(e1).toEqual(e2)
  })
  it('falha programada', async () => {
    const f = new FakeClienteLLM().falharSempre(new Transitorio())
    expect((await f.completar({ credencial, mensagens: [{ papel: 'user', conteudo: 'x' }] })).ok).toBe(false)
  })
  it('SEC-026: montarRequisicaoLlm poe a credencial so no header', () => {
    const r = montarRequisicaoLlm(
      { credencial: new CredencialResolvida('sk-zzz'), mensagens: [{ papel: 'user', conteudo: 'oi' }] },
      'm',
    )
    expect(r.headers['authorization']).toBe('Bearer sk-zzz')
    expect(JSON.stringify(r.body)).not.toContain('sk-zzz')
  })
})

describe('FakeClienteMapas', () => {
  it('geocodifica conhecido, e sem padrao desconhecido e erro permanente', async () => {
    const f = new FakeClienteMapas({ enderecos: { 'Rua A 1': { lat: 1, lng: 2 } } })
    const ok = await f.geocodificar(' rua a 1 ')
    expect(ok.ok && ok.valor).toEqual({ lat: 1, lng: 2, precisao: 'exata' })
    const nok = await f.geocodificar('lugar nenhum')
    expect(!nok.ok && nok.erro.retentavel).toBe(false)
  })
  it('SEC-024: nada vai ao console', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    const w = new FakeClienteWhats()
    await w.enviarTexto({ numero, para, texto: 'oi' })
    for (const e of espioes) {
      expect(e).not.toHaveBeenCalled()
      e.mockRestore()
    }
  })
})
