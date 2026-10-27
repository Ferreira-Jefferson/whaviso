// Resolvedor puro: heranca, excecao, ordem, disponibilidade, programacao (SP) e preco. Sem banco.
import { describe, it, expect } from 'vitest'
import {
  calcularPrecoItem,
  dentroDaProgramacao,
  estaDisponivel,
  excecoesReais,
  resolverGruposDoItem,
} from './resolvedor'
import type { Programacao } from './schemas'

const g = (id: string, ordem = 0, ativo = true) => ({ id, ordem, ativo })
const mapa = (...gs: ReturnType<typeof g>[]) => new Map(gs.map((x) => [x.id, x]))
const ids = (r: { grupo: { id: string } }[]) => r.map((x) => x.grupo.id)

describe('resolverGruposDoItem', () => {
  const grupos = mapa(g('a'), g('b'), g('c'))

  it('item herda todos os grupos da categoria', () => {
    const r = resolverGruposDoItem(
      [
        { grupo_id: 'a', ordem: 1 },
        { grupo_id: 'b', ordem: 2 },
      ],
      [],
      grupos,
    )
    expect(ids(r)).toEqual(['a', 'b'])
    expect(r.every((x) => x.origem === 'categoria')).toBe(true)
  })

  it('excecao que remove tira o grupo herdado', () => {
    const r = resolverGruposDoItem(
      [
        { grupo_id: 'a', ordem: 1 },
        { grupo_id: 'b', ordem: 2 },
      ],
      [{ grupo_id: 'b', incluir: false, ordem: 0 }],
      grupos,
    )
    expect(ids(r)).toEqual(['a'])
  })

  it('excecao que acrescenta traz o grupo com origem item', () => {
    const r = resolverGruposDoItem(
      [{ grupo_id: 'a', ordem: 1 }],
      [{ grupo_id: 'c', incluir: true, ordem: 5 }],
      grupos,
    )
    expect(ids(r)).toEqual(['a', 'c'])
    expect(r[1]?.origem).toBe('item')
  })

  it('remover grupo nao herdado e acrescentar o herdado sao neutros', () => {
    const base = resolverGruposDoItem([{ grupo_id: 'a', ordem: 1 }], [], grupos)
    const neutro = resolverGruposDoItem(
      [{ grupo_id: 'a', ordem: 1 }],
      [
        { grupo_id: 'c', incluir: false, ordem: 0 },
        { grupo_id: 'a', incluir: true, ordem: 1 },
      ],
      grupos,
    )
    expect(ids(neutro)).toEqual(ids(base))
  })

  it('grupo inativo ou ausente some', () => {
    const r = resolverGruposDoItem(
      [
        { grupo_id: 'a', ordem: 1 },
        { grupo_id: 'x', ordem: 2 },
        { grupo_id: 'i', ordem: 3 },
      ],
      [],
      mapa(g('a'), g('i', 0, false)),
    )
    expect(ids(r)).toEqual(['a'])
  })

  it('ordem: acrescentado usa item_grupos.ordem; herdado usa categoria (mesmo com link neutro); depois grupos.ordem; depois id', () => {
    const gs = mapa(g('a', 9), g('b', 1), g('c', 1), g('d', 0))
    const r = resolverGruposDoItem(
      [
        { grupo_id: 'a', ordem: 5 },
        { grupo_id: 'b', ordem: 5 },
        { grupo_id: 'c', ordem: 5 },
      ],
      [
        { grupo_id: 'a', incluir: true, ordem: 0 }, // neutro: nao muda a ordem herdada
        { grupo_id: 'd', incluir: true, ordem: 2 }, // acrescentado: ordem do item
      ],
      gs,
    )
    // d (2) antes dos tres herdados (5); entre eles desempata grupos.ordem (b=1,c=1 antes de a=9).
    expect(ids(r)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('propriedade: resultado independe da ordem de insercao dos vinculos', () => {
    const cat = [
      { grupo_id: 'a', ordem: 2 },
      { grupo_id: 'b', ordem: 1 },
      { grupo_id: 'c', ordem: 1 },
    ]
    const item = [
      { grupo_id: 'b', incluir: false, ordem: 0 },
      { grupo_id: 'c', incluir: true, ordem: 7 },
    ]
    const esperado = ids(resolverGruposDoItem(cat, item, grupos))
    for (let i = 0; i < 20; i++) {
      const emb = (xs: typeof cat) => [...xs].sort(() => Math.random() - 0.5)
      const embI = [...item].sort(() => Math.random() - 0.5)
      expect(ids(resolverGruposDoItem(emb(cat), embI, grupos))).toEqual(esperado)
    }
  })
})

describe('excecoesReais', () => {
  it('so conta o que muda o resultado', () => {
    const herdados = new Set(['a', 'b'])
    const r = excecoesReais(herdados, [
      { grupo_id: 'a', incluir: true, ordem: 0 }, // neutra
      { grupo_id: 'b', incluir: false, ordem: 0 }, // real
      { grupo_id: 'c', incluir: true, ordem: 0 }, // real
      { grupo_id: 'd', incluir: false, ordem: 0 }, // neutra
    ])
    expect(r.map((x) => x.grupo_id).sort()).toEqual(['b', 'c'])
  })
})

describe('estaDisponivel', () => {
  const agora = new Date('2026-03-10T15:00:00Z')
  it('inativo nunca', () => expect(estaDisponivel({ ativo: false, esgotado_ate: null }, agora)).toBe(false))
  it('esgotado_ate no passado = disponivel', () =>
    expect(estaDisponivel({ ativo: true, esgotado_ate: new Date('2026-03-10T14:59:59Z') }, agora)).toBe(true))
  it('esgotado_ate no futuro = indisponivel', () =>
    expect(estaDisponivel({ ativo: true, esgotado_ate: new Date('2026-03-10T15:00:01Z') }, agora)).toBe(false))
  it('esgotado_ate exatamente agora = disponivel', () =>
    expect(estaDisponivel({ ativo: true, esgotado_ate: new Date(agora) }, agora)).toBe(true))
  it('sem esgotado_ate = disponivel', () =>
    expect(estaDisponivel({ ativo: true, esgotado_ate: null }, agora)).toBe(true))
})

describe('dentroDaProgramacao (America/Sao_Paulo)', () => {
  const almoco: Programacao = { janelas: [{ dias: [1, 2, 3, 4, 5], inicio: '11:00', fim: '15:00' }] }
  // SP = UTC-3: 2026-03-09 e segunda-feira.
  it('null = sempre', () => expect(dentroDaProgramacao(null, new Date())).toBe(true))
  it('dentro da janela (relogio de SP, nao UTC)', () => {
    expect(dentroDaProgramacao(almoco, new Date('2026-03-09T15:00:00Z'))).toBe(true) // 12:00 SP
    expect(dentroDaProgramacao(almoco, new Date('2026-03-09T13:59:00Z'))).toBe(false) // 10:59 SP
  })
  it('fim e exclusivo', () => {
    expect(dentroDaProgramacao(almoco, new Date('2026-03-09T17:59:00Z'))).toBe(true) // 14:59 SP
    expect(dentroDaProgramacao(almoco, new Date('2026-03-09T18:00:00Z'))).toBe(false) // 15:00 SP
  })
  it('dia fora da lista (domingo)', () => {
    expect(dentroDaProgramacao(almoco, new Date('2026-03-08T15:00:00Z'))).toBe(false)
  })
  it('janela cruzando a meia-noite vale no dia seguinte, no relogio de SP', () => {
    const noite: Programacao = { janelas: [{ dias: [6], inicio: '22:00', fim: '02:00' }] } // sabado
    expect(dentroDaProgramacao(noite, new Date('2026-03-15T02:30:00Z'))).toBe(true) // sab 23:30 SP
    expect(dentroDaProgramacao(noite, new Date('2026-03-15T04:00:00Z'))).toBe(true) // dom 01:00 SP
    expect(dentroDaProgramacao(noite, new Date('2026-03-15T05:00:00Z'))).toBe(false) // dom 02:00 SP
    expect(dentroDaProgramacao(noite, new Date('2026-03-14T02:30:00Z'))).toBe(false) // sex 23:30 SP
  })
  it('varias janelas: basta uma', () => {
    const p: Programacao = {
      janelas: [
        { dias: [1], inicio: '08:00', fim: '09:00' },
        { dias: [1], inicio: '18:00', fim: '19:00' },
      ],
    }
    expect(dentroDaProgramacao(p, new Date('2026-03-09T21:30:00Z'))).toBe(true) // 18:30 SP
    expect(dentroDaProgramacao(p, new Date('2026-03-09T16:00:00Z'))).toBe(false) // 13:00 SP
  })
})

describe('calcularPrecoItem', () => {
  it('soma base e opcoes em centavos inteiros', () => {
    expect(calcularPrecoItem(2500, [{ preco_centavos: 500 }, { preco_centavos: 199 }])).toBe(3199)
  })
  it('sem opcoes = preco base', () => expect(calcularPrecoItem(1800, [])).toBe(1800))
})
