// Calculo puro de promocao: sem banco, sem relogio real.
import { describe, it, expect } from 'vitest'
import { aplicarDesconto, calcularPromocao, type ContextoPedido, type RegraPromocao } from './calculo'

const AGORA = new Date('2026-10-27T15:00:00Z')
const regra = (p: Partial<RegraPromocao> = {}): RegraPromocao => ({
  tipo: 'cupom_percentual', valor: 10, ativo: true, inicio_em: null, fim_em: null,
  limite_total: null, limite_por_cliente: null, min_pedido_centavos: 0,
  desconto_maximo_centavos: null, itens: [], ...p,
})
const ctx = (c: Partial<ContextoPedido> = {}): ContextoPedido => ({
  agora: AGORA, subtotal_centavos: 10_000, usos_total: 0, usos_cliente: 0, tem_cliente: true, ...c,
})
const ok = (r: ReturnType<typeof calcularPromocao>) => (r.valido ? r.desconto_centavos : r.motivo)

describe('calcularPromocao', () => {
  it('percentual arredonda para baixo', () => {
    expect(ok(calcularPromocao(regra({ valor: 15 }), ctx({ subtotal_centavos: 1_999 })))).toBe(299)
  })
  it('fixo nunca passa do subtotal', () => {
    expect(ok(calcularPromocao(regra({ tipo: 'cupom_fixo', valor: 5_000 }), ctx({ subtotal_centavos: 3_000 })))).toBe(3_000)
  })
  it('teto de desconto limita o percentual', () => {
    expect(ok(calcularPromocao(regra({ valor: 50, desconto_maximo_centavos: 1_000 }), ctx()))).toBe(1_000)
  })
  it('recusas por estado e janela', () => {
    expect(ok(calcularPromocao(regra({ ativo: false }), ctx()))).toBe('cupom_inativo')
    expect(ok(calcularPromocao(regra({ inicio_em: '2026-10-28T00:00:00Z' }), ctx()))).toBe('cupom_nao_iniciado')
    expect(ok(calcularPromocao(regra({ fim_em: '2026-10-27T15:00:00Z' }), ctx()))).toBe('cupom_expirado')
    expect(ok(calcularPromocao(regra({ fim_em: '2026-10-27T15:00:01Z' }), ctx()))).toBe(1_000)
  })
  it('limites total e por cliente', () => {
    expect(ok(calcularPromocao(regra({ limite_total: 5 }), ctx({ usos_total: 5 })))).toBe('cupom_esgotado')
    expect(ok(calcularPromocao(regra({ limite_por_cliente: 1 }), ctx({ usos_cliente: 1 })))).toBe('cupom_cliente_esgotado')
    // sem cliente identificado o limite por cliente nao bloqueia
    expect(ok(calcularPromocao(regra({ limite_por_cliente: 1 }), ctx({ usos_cliente: 9, tem_cliente: false })))).toBe(1_000)
  })
  it('pedido minimo', () => {
    expect(ok(calcularPromocao(regra({ min_pedido_centavos: 10_001 }), ctx()))).toBe('pedido_abaixo_minimo')
    expect(ok(calcularPromocao(regra({ min_pedido_centavos: 10_000 }), ctx()))).toBe(1_000)
  })
  describe('combo', () => {
    const combo = regra({
      tipo: 'combo', valor: 4_000,
      itens: [{ item_id: 'a', quantidade: 1 }, { item_id: 'b', quantidade: 2 }],
    })
    const linhas = [
      { item_id: 'a', quantidade: 2, preco_unitario_centavos: 3_000 },
      { item_id: 'b', quantidade: 5, preco_unitario_centavos: 1_000 },
      { item_id: 'z', quantidade: 1, preco_unitario_centavos: 900 },
    ]
    it('desconta por conjunto completo (2 conjuntos)', () => {
      // normal por conjunto: 3000 + 2*1000 = 5000; combo 4000 => 1000 x 2 conjuntos
      expect(ok(calcularPromocao(combo, ctx({ subtotal_centavos: 12_900, linhas })))).toBe(2_000)
    })
    it('item faltando ou sem linhas = combo_incompleto', () => {
      expect(ok(calcularPromocao(combo, ctx({ linhas: [linhas[0]!] })))).toBe('combo_incompleto')
      expect(ok(calcularPromocao(combo, ctx()))).toBe('combo_incompleto')
    })
    it('combo mais caro que o avulso nao gera desconto negativo', () => {
      expect(ok(calcularPromocao(regra({ ...combo, valor: 9_000 }), ctx({ linhas })))).toBe(0)
    })
  })
  it('aplicarDesconto nunca fica negativo', () => {
    expect(aplicarDesconto(1_000, 400)).toBe(600)
    expect(aplicarDesconto(1_000, 2_000)).toBe(0)
  })
})
