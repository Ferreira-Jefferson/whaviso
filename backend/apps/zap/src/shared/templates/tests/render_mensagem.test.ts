import { describe, expect, it } from 'vitest'
import { renderMensagem } from '../index'

const base = {
  conteudo: {
    texto: 'Oi, {{1}}. {{2}} pediu: {{3}}.',
    botoes: [
      { acao: 'ja_paguei', rotulo: 'Já paguei' },
      { acao: 'ver_pix', rotulo: 'Ver chave Pix' },
    ],
  },
  variaveis: ['nome_devedor', 'cobrador', 'motivo'],
  nome_meta: 'whaviso_d2_antecipado',
  idioma: 'pt_BR',
}

const valores = { nome_devedor: 'João', cobrador: 'Maria', motivo: 'empréstimo' }

describe('renderMensagem', () => {
  it('sem comoTemplate: só texto + botões, sem descritor de template', () => {
    const m = renderMensagem(base, '5511999999999', { valores, refId: 'aviso1' })
    expect(m.texto).toBe('Oi, João. Maria pediu: empréstimo.')
    expect(m.botoes).toEqual([
      { id: 'ja_paguei:aviso1', rotulo: 'Já paguei' },
      { id: 'ver_pix:aviso1', rotulo: 'Ver chave Pix' },
    ])
    expect(m.template).toBeUndefined()
  })

  it('comoTemplate: anexa descritor com parâmetros posicionais e payload dos botões', () => {
    const m = renderMensagem(base, '5511999999999', { valores, refId: 'aviso1', comoTemplate: true })
    // texto renderizado continua presente (preview/fallback).
    expect(m.texto).toBe('Oi, João. Maria pediu: empréstimo.')
    expect(m.template).toEqual({
      nome: 'whaviso_d2_antecipado',
      idioma: 'pt_BR',
      parametros: ['João', 'Maria', 'empréstimo'],
      botoesPayload: ['ja_paguei:aviso1', 'ver_pix:aviso1'],
    })
  })

  it('comoTemplate: parâmetro sem valor vira string vazia, na ordem de variaveis', () => {
    const m = renderMensagem(base, '5511999999999', {
      valores: { nome_devedor: 'João' },
      refId: 'aviso1',
      comoTemplate: true,
    })
    expect(m.template?.parametros).toEqual(['João', '', ''])
  })

  it('comoTemplate sem nome_meta: não anexa descritor (cai para texto livre)', () => {
    const semNome = { conteudo: base.conteudo, variaveis: base.variaveis }
    const m = renderMensagem(semNome, '5511999999999', { valores, refId: 'aviso1', comoTemplate: true })
    expect(m.template).toBeUndefined()
  })

  it('comoTemplate sem refId: descritor sem botoesPayload', () => {
    const m = renderMensagem(base, '5511999999999', { valores, comoTemplate: true })
    expect(m.template?.botoesPayload).toBeUndefined()
    expect(m.botoes).toBeUndefined()
  })
})
