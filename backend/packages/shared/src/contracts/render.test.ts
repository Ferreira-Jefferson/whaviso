// Renderizador puro compartilhado de texto de template (FONTE ÚNICA do preview da
// api e do envio do zap, H12.7/E12-M1). O ponto crítico é o VALOR AUSENTE: tem de
// virar string vazia (paridade preview↔envio), não placeholder.
import { describe, expect, it } from 'vitest'
import { renderizarTexto } from './render'

describe('renderizarTexto (render compartilhado preview↔envio)', () => {
  it('substitui {{n}} na ordem de variaveis', () => {
    expect(
      renderizarTexto('Oi {{1}}, sobre {{2}}', ['nome', 'motivo'], {
        nome: 'Ana',
        motivo: 'mensalidade',
      }),
    ).toBe('Oi Ana, sobre mensalidade')
  })

  it('valor AUSENTE vira string vazia (paridade M1: nunca placeholder {{nome}})', () => {
    // 'nome' está em variaveis mas sem valor no mapa -> '' nos dois lados.
    expect(renderizarTexto('Oi {{1}}!', ['nome'], {})).toBe('Oi !')
    expect(renderizarTexto('Oi {{1}}, {{2}}', ['nome', 'motivo'], { motivo: 'x' })).toBe('Oi , x')
  })

  it('token fora da faixa de variaveis fica INTACTO', () => {
    // {{2}} não tem variável correspondente (só uma): não há nome a resolver.
    expect(renderizarTexto('Oi {{1}} {{2}}', ['nome'], { nome: 'Ana' })).toBe('Oi Ana {{2}}')
    expect(renderizarTexto('Sem var {{1}}', [], {})).toBe('Sem var {{1}}')
  })

  it('texto sem tokens passa intacto; repete o mesmo token quantas vezes aparecer', () => {
    expect(renderizarTexto('texto fixo', ['nome'], { nome: 'Ana' })).toBe('texto fixo')
    expect(renderizarTexto('{{1}} e {{1}}', ['nome'], { nome: 'Ana' })).toBe('Ana e Ana')
  })
})
