import { describe, expect, it } from 'vitest'
import { CredencialResolvida, FakeClienteWhats, type NumeroWhats } from '@whaviso/shared/clientes'
import { despachar } from './despacho'

const numero = (): NumeroWhats => ({
  phoneNumberId: '100200300',
  credencial: new CredencialResolvida('tok'),
})
const para = '+5511999998888'

describe('despacho por tipo de payload', () => {
  it('texto -> enviarTexto com o mesmo destino e texto', async () => {
    const whats = new FakeClienteWhats()
    const r = await despachar(whats, { numero: numero(), para, mensagem: { tipo: 'texto', texto: 'oi' } })
    expect(r.ok).toBe(true)
    expect(whats.chamadas).toHaveLength(1)
    expect(whats.chamadas[0]!.operacao).toBe('enviarTexto')
    expect(whats.chamadas[0]!.entrada).toMatchObject({ para, texto: 'oi' })
  })

  it('interativo -> enviarInterativo mapeando rotulo->titulo', async () => {
    const whats = new FakeClienteWhats()
    await despachar(whats, {
      numero: numero(),
      para,
      mensagem: { tipo: 'interativo', texto: 'escolha', botoes: [{ id: 'sim', rotulo: 'Sim' }] },
    })
    expect(whats.chamadas[0]!.operacao).toBe('enviarInterativo')
    expect(whats.chamadas[0]!.entrada).toMatchObject({
      corpo: 'escolha',
      interacao: { tipo: 'botoes', botoes: [{ id: 'sim', titulo: 'Sim' }] },
    })
  })

  it('template com resolucao -> enviarTemplate com nome aprovado e parametros em ordem', async () => {
    const whats = new FakeClienteWhats()
    await despachar(whats, {
      numero: numero(),
      para,
      mensagem: { tipo: 'template', template: 'pedido.recebido' },
      template: { nomeMeta: 'pedido_recebido', idioma: 'pt_BR', parametros: ['Ana', '#12'] },
    })
    expect(whats.chamadas[0]!.operacao).toBe('enviarTemplate')
    expect(whats.chamadas[0]!.entrada).toMatchObject({
      nome: 'pedido_recebido',
      idioma: 'pt_BR',
      componentes: [{ tipo: 'body', parametros: ['Ana', '#12'] }],
    })
  })

  it('template sem resolucao -> falha permanente sem round-trip', async () => {
    const whats = new FakeClienteWhats()
    const r = await despachar(whats, {
      numero: numero(),
      para,
      mensagem: { tipo: 'template', template: 'x' },
    })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro.codigo).toBe('template_indisponivel')
    expect(whats.chamadas).toHaveLength(0)
  })
})
