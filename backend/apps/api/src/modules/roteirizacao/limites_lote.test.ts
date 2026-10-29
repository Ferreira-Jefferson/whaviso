// Teste de UNIDADE (puro, sem banco): trava o teto de tamanho dos arrays de ids da roteirizacao
// (SEC-080/081, defesa contra payload gigante). Remover o `.max()` do contrato quebra isto.
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ROTEIRIZACAO_PEDIDOS_MAX } from '@whaviso/shared/contracts'
import {
  RoteirizacaoSugerirEntrada,
  RoteirizacaoAceitarEntrada,
  RoteirizacaoReordenarEntrada,
} from './schemas'

const ids = (n: number): string[] => Array.from({ length: n }, () => randomUUID())
const TETO_CORRIDA = 10

describe('Roteirizacao: teto dos arrays de ids em lote', () => {
  it(`Sugerir aceita ${ROTEIRIZACAO_PEDIDOS_MAX} ids e rejeita ${ROTEIRIZACAO_PEDIDOS_MAX + 1}`, () => {
    expect(RoteirizacaoSugerirEntrada.safeParse({ pedido_ids: ids(ROTEIRIZACAO_PEDIDOS_MAX) }).success).toBe(true)
    expect(RoteirizacaoSugerirEntrada.safeParse({ pedido_ids: ids(ROTEIRIZACAO_PEDIDOS_MAX + 1) }).success).toBe(false)
  })

  it(`Aceitar aceita ${TETO_CORRIDA} ids e rejeita ${TETO_CORRIDA + 1}`, () => {
    expect(RoteirizacaoAceitarEntrada.safeParse({ pedido_ids: ids(TETO_CORRIDA) }).success).toBe(true)
    expect(RoteirizacaoAceitarEntrada.safeParse({ pedido_ids: ids(TETO_CORRIDA + 1) }).success).toBe(false)
  })

  it(`Reordenar aceita ${TETO_CORRIDA} ids e rejeita ${TETO_CORRIDA + 1}`, () => {
    expect(RoteirizacaoReordenarEntrada.safeParse({ pedido_ids: ids(TETO_CORRIDA) }).success).toBe(true)
    expect(RoteirizacaoReordenarEntrada.safeParse({ pedido_ids: ids(TETO_CORRIDA + 1) }).success).toBe(false)
  })

  it('Reordenar exige ao menos 2 ids (min 2); Aceitar rejeita vazio (min 1)', () => {
    expect(RoteirizacaoReordenarEntrada.safeParse({ pedido_ids: ids(1) }).success).toBe(false)
    expect(RoteirizacaoAceitarEntrada.safeParse({ pedido_ids: [] }).success).toBe(false)
  })
})
