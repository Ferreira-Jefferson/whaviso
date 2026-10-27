import { describe, it, expect } from 'vitest'
import type { HttpError } from '../../shared/http_errors'
import type { GrupoRow } from './cardapio_leitura'
import { montarLinha, montarPedido, type CardapioLido } from './montador'

const AGORA = new Date('2026-10-27T15:00:00Z') // terca, 12:00 em Sao Paulo
const futuro = new Date('2026-10-28T15:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

interface Variacao {
  itemAtivo?: boolean
  itemEsgotado?: Date | null
  catProg?: { janelas: { dias: number[]; inicio: string; fim: string }[] } | null
  opEsgotada?: Date | null
}

function cardapio(v: Variacao = {}): CardapioLido {
  const grupoTam: GrupoRow = { id: id(10), nome: 'Tamanho', obrigatorio: true, min_escolhas: 1, max_escolhas: 1, aplica_a_opcao_id: null, ativo: true, ordem: 0 }
  const grupoAdd: GrupoRow = { id: id(11), nome: 'Adicionais', obrigatorio: false, min_escolhas: 0, max_escolhas: 2, aplica_a_opcao_id: id(21), ativo: true, ordem: 1 }
  const op = (n: number, g: string, nome: string, preco: number, esg: Date | null = null) =>
    ({ id: id(n), grupo_id: g, nome, preco_centavos: preco, ativo: true, esgotado_ate: esg })
  const opcoes = [
    op(20, id(10), 'Pequena', 0), op(21, id(10), 'Grande', 500, v.opEsgotada ?? null),
    op(30, id(11), 'Bacon', 300), op(31, id(11), 'Ovo', 200), op(32, id(11), 'Queijo', 250),
  ]
  return {
    itens: new Map([
      [id(1), { id: id(1), categoria_id: id(2), nome: 'Burger', preco_centavos: 2000, ativo: v.itemAtivo ?? true, esgotado_ate: v.itemEsgotado ?? null }],
      [id(5), { id: id(5), categoria_id: id(2), nome: 'Suco', preco_centavos: 800, ativo: true, esgotado_ate: null }],
    ]),
    categorias: new Map([[id(2), { id: id(2), ativo: true, programacao: v.catProg ?? null }]]),
    grupos: new Map([[grupoTam.id, grupoTam], [grupoAdd.id, grupoAdd]]),
    opcoes: new Map(opcoes.map((o) => [o.id, o])),
    vinculosCategoria: new Map([[id(2), [{ grupo_id: id(10), ordem: 0 }, { grupo_id: id(11), ordem: 1 }]]]),
    // Suco remove os dois grupos herdados (excecao por item).
    vinculosItem: new Map([[id(5), [
      { item_id: id(5), grupo_id: id(10), incluir: false, ordem: 0 },
      { item_id: id(5), grupo_id: id(11), incluir: false, ordem: 0 },
    ]]]),
  }
}
const codigo = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    return (e as HttpError).code
  }
  return 'ok'
}
const linha = (c: CardapioLido, item: number, ops: number[]) => () =>
  montarLinha(c, { item_id: id(item), quantidade: 1, opcoes_ids: ops.map(id) }, AGORA)

describe('montador de pedido', () => {
  it('preco = (base + opcoes) x quantidade, em centavos inteiros, com snapshot', () => {
    const l = montarLinha(cardapio(), { item_id: id(1), quantidade: 3, opcoes_ids: [id(21), id(30), id(31)] }, AGORA)
    expect(l.preco_unitario_centavos).toBe(2000)
    expect(l.total_centavos).toBe((2000 + 500 + 300 + 200) * 3)
    expect(l.nome_snapshot).toBe('Burger')
    expect(l.opcoes.map((o) => [o.grupo_nome_snapshot, o.nome_snapshot, o.preco_centavos])).toEqual([
      ['Tamanho', 'Grande', 500], ['Adicionais', 'Bacon', 300], ['Adicionais', 'Ovo', 200],
    ])
  })

  it('total = subtotal + taxa', () => {
    const m = montarPedido(cardapio(), [
      { item_id: id(1), quantidade: 1, opcoes_ids: [id(20)] }, { item_id: id(5), quantidade: 2, opcoes_ids: [] },
    ], 650, AGORA)
    expect(m.subtotal_centavos).toBe(2000 + 1600)
    expect(m.total_centavos).toBe(m.subtotal_centavos + 650)
  })

  it('rejeita grupo obrigatorio sem escolha, acima do max, opcao de outro item, add-on sem aplica_a, duplicada', () => {
    const c = cardapio()
    expect(codigo(linha(c, 1, []))).toBe('grupo_obrigatorio')
    expect(codigo(linha(c, 1, [20, 21]))).toBe('grupo_excede_maximo')
    expect(codigo(linha(c, 1, [21, 30, 31, 32]))).toBe('grupo_excede_maximo')
    expect(codigo(linha(c, 5, [20]))).toBe('opcao_invalida')
    expect(codigo(linha(c, 1, [20, 30]))).toBe('opcao_invalida')
    expect(codigo(linha(c, 1, [20, 20]))).toBe('opcao_duplicada')
    expect(codigo(linha(c, 99, []))).toBe('item_invalido')
  })

  it('rejeita item esgotado/inativo, opcao esgotada e categoria fora da programacao', () => {
    expect(codigo(linha(cardapio({ itemAtivo: false }), 1, [20]))).toBe('item_indisponivel')
    expect(codigo(linha(cardapio({ itemEsgotado: futuro }), 1, [20]))).toBe('item_indisponivel')
    expect(codigo(linha(cardapio({ opEsgotada: futuro }), 1, [21]))).toBe('opcao_indisponivel')
    const domingo = { janelas: [{ dias: [0], inicio: '00:00', fim: '23:59' }] }
    expect(codigo(linha(cardapio({ catProg: domingo }), 1, [20]))).toBe('item_indisponivel')
    const terca = { janelas: [{ dias: [2], inicio: '00:00', fim: '23:59' }] }
    expect(codigo(linha(cardapio({ catProg: terca }), 1, [20]))).toBe('ok')
  })
})
