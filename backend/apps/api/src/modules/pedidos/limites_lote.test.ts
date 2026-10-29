// Teste de UNIDADE (puro, sem banco): trava o teto de tamanho do array de ids da transicao em lote
// (SEC-080/081, defesa contra payload gigante). Se alguem remover o `.max()` do contrato, isto quebra.
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PedidoTransicaoLoteEntrada } from './schemas'

const ids = (n: number): string[] => Array.from({ length: n }, () => randomUUID())
const TETO = 100

describe('PedidoTransicaoLoteEntrada: teto do array de ids', () => {
  it(`aceita ${TETO} ids (no teto)`, () => {
    const r = PedidoTransicaoLoteEntrada.safeParse({ pedido_ids: ids(TETO), para: 'em_preparo' })
    expect(r.success).toBe(true)
  })

  it(`rejeita ${TETO + 1} ids (acima do teto)`, () => {
    const r = PedidoTransicaoLoteEntrada.safeParse({ pedido_ids: ids(TETO + 1), para: 'em_preparo' })
    expect(r.success).toBe(false)
  })

  it('rejeita array vazio (min 1)', () => {
    const r = PedidoTransicaoLoteEntrada.safeParse({ pedido_ids: [], para: 'em_preparo' })
    expect(r.success).toBe(false)
  })
})
