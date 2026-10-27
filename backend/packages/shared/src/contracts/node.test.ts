import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { MensagemProposta, SaidaNode, type NodeContract } from './node'

describe('MensagemProposta', () => {
  it('aceita texto e rejeita chave desconhecida (strict)', () => {
    expect(MensagemProposta.safeParse({ tipo: 'texto', texto: 'oi' }).success).toBe(true)
    expect(MensagemProposta.safeParse({ tipo: 'texto', texto: 'oi', extra: 1 }).success).toBe(false)
  })
  it('limita botões do interativo a no máximo 3', () => {
    const botao = (i: number) => ({ id: `b${i}`, rotulo: `R${i}` })
    expect(
      MensagemProposta.safeParse({ tipo: 'interativo', texto: 't', botoes: [botao(1), botao(2), botao(3)] })
        .success,
    ).toBe(true)
    expect(
      MensagemProposta.safeParse({
        tipo: 'interativo',
        texto: 't',
        botoes: [botao(1), botao(2), botao(3), botao(4)],
      }).success,
    ).toBe(false)
  })
})

describe('SaidaNode', () => {
  it('aplica defaults de mensagens e efeitos', () => {
    const s = SaidaNode.parse({ proximo: 'fim' })
    expect(s.mensagens).toEqual([])
    expect(s.efeitos).toEqual([])
  })
  it('aceita proximo null (fim do fluxo)', () => {
    expect(SaidaNode.parse({ proximo: null }).proximo).toBeNull()
  })
})

describe('NodeContract', () => {
  it('um node de exemplo satisfaz o contrato e produz SaidaNode válida', async () => {
    const configSchema = z.object({ saudacao: z.string() }).strict()
    const node: NodeContract<z.infer<typeof configSchema>, { nome: string }> = {
      tipo: 'boas_vindas',
      configSchema,
      usaLlm: false,
      async executar(entrada, config) {
        return SaidaNode.parse({
          proximo: 'menu',
          mensagens: [{ tipo: 'texto', texto: `${config.saudacao}, ${entrada.nome}` }],
        })
      },
    }
    const saida = await node.executar({ nome: 'Ana' }, { saudacao: 'Bem-vinda' }, {
      loja_id: '00000000-0000-0000-0000-000000000001',
      conversa_id: '00000000-0000-0000-0000-000000000002',
    })
    expect(saida.proximo).toBe('menu')
    expect(SaidaNode.safeParse(saida).success).toBe(true)
  })
})
