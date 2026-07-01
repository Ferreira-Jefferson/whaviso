import { describe, expect, it } from 'vitest'
import { montarDefTemplate } from '../template_payload'

describe('montarDefTemplate', () => {
  it('UTILITY com {{n}}: BODY com text indexado + example na ordem das variáveis', () => {
    const def = montarDefTemplate({
      nomeMeta: 'ciclo_d2',
      idioma: 'pt_BR',
      categoria: 'UTILITY',
      conteudo: { texto: 'Oi {{1}}, sobre {{2}}.' },
      variaveis: ['nome', 'motivo'],
      exemplos: { nome: 'Maria', motivo: 'mensalidade' },
    })
    expect(def.name).toBe('ciclo_d2')
    expect(def.language).toBe('pt_BR')
    expect(def.category).toBe('UTILITY')
    const comps = def.components as Array<Record<string, unknown>>
    expect(comps[0]).toEqual({
      type: 'BODY',
      text: 'Oi {{1}}, sobre {{2}}.',
      example: { body_text: [['Maria', 'mensalidade']] },
    })
  })

  it('sem variáveis: BODY sem example', () => {
    const def = montarDefTemplate({
      nomeMeta: 'resposta_aceite',
      idioma: 'pt_BR',
      categoria: 'UTILITY',
      conteudo: { texto: 'Combinado confirmado!' },
      variaveis: [],
      exemplos: {},
    })
    const comps = def.components as Array<Record<string, unknown>>
    expect(comps[0]).toEqual({ type: 'BODY', text: 'Combinado confirmado!' })
    expect(comps.length).toBe(1)
  })

  it('com botões: BUTTONS quick_reply a partir dos rótulos', () => {
    const def = montarDefTemplate({
      nomeMeta: 'ciclo_d',
      idioma: 'pt_BR',
      categoria: 'UTILITY',
      conteudo: {
        texto: 'Lembrete',
        botoes: [
          { acao: 'ja_paguei', rotulo: 'Já paguei' },
          { acao: 'ver_pix', rotulo: 'Ver chave Pix' },
        ],
      },
      variaveis: [],
      exemplos: {},
    })
    const comps = def.components as Array<Record<string, unknown>>
    expect(comps[1]).toEqual({
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Já paguei' },
        { type: 'QUICK_REPLY', text: 'Ver chave Pix' },
      ],
    })
  })

  it('exemplo ausente cai no nome da variável (nunca vazio)', () => {
    const def = montarDefTemplate({
      nomeMeta: 't',
      idioma: 'pt_BR',
      categoria: 'UTILITY',
      conteudo: { texto: '{{1}}' },
      variaveis: ['valor'],
      exemplos: {},
    })
    const comps = def.components as Array<Record<string, unknown>>
    expect((comps[0]!.example as { body_text: string[][] }).body_text).toEqual([['valor']])
  })

  it('AUTHENTICATION: formato fixo (body auto + OTP copy-code)', () => {
    const def = montarDefTemplate({
      nomeMeta: 'whaviso_otp',
      idioma: 'pt_BR',
      categoria: 'AUTHENTICATION',
      conteudo: { texto: '' },
      variaveis: ['codigo'],
      exemplos: {},
    })
    expect(def.category).toBe('AUTHENTICATION')
    const comps = def.components as Array<Record<string, unknown>>
    expect(comps[0]).toMatchObject({ type: 'BODY', add_security_recommendation: true })
    expect(comps[2]).toEqual({ type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }] })
  })
})
