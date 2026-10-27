// Regras puras do funil: matriz de estagios, vinculo, descricao de conclusao e cursor.
import { describe, expect, it } from 'vitest'
import {
  codificarCursor,
  decodificarCursor,
  descricaoDeConclusao,
  imitaConclusao,
  lerDescricao,
  validarTransicaoManual,
  validarVinculo,
} from './estagios'

describe('estagios: transicao manual', () => {
  const validas: [string, string][] = [
    ['novo', 'contato'], ['novo', 'perdido'],
    ['contato', 'proposta'], ['contato', 'perdido'], ['contato', 'novo'],
    ['proposta', 'perdido'], ['proposta', 'contato'],
    ['perdido', 'novo'],
  ]
  it.each(validas)('%s -> %s permitida', (de, para) => {
    expect(validarTransicaoManual(de as never, para as never).ok).toBe(true)
  })

  const invalidas: [string, string][] = [
    ['novo', 'proposta'], ['novo', 'novo'], ['perdido', 'contato'], ['perdido', 'proposta'],
    ['contato', 'contato'], ['proposta', 'novo'],
  ]
  it.each(invalidas)('%s -> %s recusada (transicao_invalida)', (de, para) => {
    const r = validarTransicaoManual(de as never, para as never)
    expect(r).toMatchObject({ ok: false, code: 'transicao_invalida' })
  })

  it('ativo nunca e destino manual (so via vinculo)', () => {
    for (const de of ['novo', 'contato', 'proposta', 'perdido'] as const) {
      expect(validarTransicaoManual(de, 'ativo')).toMatchObject({ ok: false, code: 'estagio_ativo_via_vinculo' })
    }
  })

  it('ativo e terminal', () => {
    for (const para of ['novo', 'contato', 'proposta', 'perdido'] as const) {
      expect(validarTransicaoManual('ativo', para)).toMatchObject({ ok: false, code: 'estagio_terminal' })
    }
  })
})

describe('estagios: vinculo de conta', () => {
  it('novo, contato e proposta podem vincular', () => {
    for (const e of ['novo', 'contato', 'proposta'] as const) expect(validarVinculo(e).ok).toBe(true)
  })
  it('perdido precisa reabrir; ativo ja vinculado', () => {
    expect(validarVinculo('perdido')).toMatchObject({ ok: false, code: 'estagio_nao_vinculavel' })
    expect(validarVinculo('ativo')).toMatchObject({ ok: false, code: 'prospecto_ja_vinculado' })
  })
})

describe('estagios: descricao de conclusao', () => {
  it('ida e volta, com e sem texto', () => {
    expect(lerDescricao(descricaoDeConclusao(7))).toEqual({ concluiId: 7, texto: null })
    expect(lerDescricao(descricaoDeConclusao(7, 'ligou'))).toEqual({ concluiId: 7, texto: 'ligou' })
  })
  it('texto livre fica texto; null fica null', () => {
    expect(lerDescricao('so uma nota')).toEqual({ concluiId: null, texto: 'so uma nota' })
    expect(lerDescricao(null)).toEqual({ concluiId: null, texto: null })
  })
  it('imitaConclusao pega a marca mesmo com espacos', () => {
    expect(imitaConclusao('{"conclui": 3}')).toBe(true)
    expect(imitaConclusao('  {"conclui":3}')).toBe(true)
    expect(imitaConclusao('conclui 3')).toBe(false)
  })
})

describe('estagios: cursor', () => {
  it('ida e volta e malformado vira null', () => {
    const c = codificarCursor({ t: '2026-01-01T00:00:00.000000Z', id: 'x' })
    expect(decodificarCursor(c)).toEqual({ t: '2026-01-01T00:00:00.000000Z', id: 'x' })
    expect(decodificarCursor('%%%')).toBeNull()
    expect(decodificarCursor(Buffer.from('[1]').toString('base64url'))).toBeNull()
  })
})
