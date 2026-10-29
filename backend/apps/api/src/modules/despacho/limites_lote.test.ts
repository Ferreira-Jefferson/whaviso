// Teste de UNIDADE (puro, sem banco): trava o teto de tamanho dos arrays de ids do despacho
// (CORRIDA_PEDIDOS_MAX, SEC-081, defesa contra payload gigante). Remover o `.max()` do contrato quebra isto.
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CORRIDA_PEDIDOS_MAX } from '@whaviso/shared/contracts'
import { CorridaEntrada, AdicionarPedidosEntrada, ReordenarParadasEntrada } from './schemas'

const ids = (n: number): string[] => Array.from({ length: n }, () => randomUUID())
const TETO = CORRIDA_PEDIDOS_MAX

describe('Despacho: teto dos arrays de ids em lote', () => {
  it(`CorridaEntrada aceita ${TETO} ids e rejeita ${TETO + 1}`, () => {
    expect(CorridaEntrada.safeParse({ pedido_ids: ids(TETO) }).success).toBe(true)
    expect(CorridaEntrada.safeParse({ pedido_ids: ids(TETO + 1) }).success).toBe(false)
  })

  it(`AdicionarPedidosEntrada aceita ${TETO} ids e rejeita ${TETO + 1}`, () => {
    expect(AdicionarPedidosEntrada.safeParse({ pedido_ids: ids(TETO) }).success).toBe(true)
    expect(AdicionarPedidosEntrada.safeParse({ pedido_ids: ids(TETO + 1) }).success).toBe(false)
  })

  it(`ReordenarParadasEntrada aceita ${TETO} ids e rejeita ${TETO + 1}`, () => {
    expect(ReordenarParadasEntrada.safeParse({ pedido_ids: ids(TETO) }).success).toBe(true)
    expect(ReordenarParadasEntrada.safeParse({ pedido_ids: ids(TETO + 1) }).success).toBe(false)
  })

  it('AdicionarPedidosEntrada rejeita array vazio (min 1)', () => {
    expect(AdicionarPedidosEntrada.safeParse({ pedido_ids: [] }).success).toBe(false)
  })
})
