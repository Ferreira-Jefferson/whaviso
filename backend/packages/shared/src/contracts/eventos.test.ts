import { describe, it, expect } from 'vitest'
import {
  CANAIS_REALTIME,
  EventoDominio,
  tipoEvento,
  validarEvento,
} from './eventos'

const LOJA = '11111111-1111-4111-8111-111111111111'
const PEDIDO = '22222222-2222-4222-8222-222222222222'
const CONVERSA = '33333333-3333-4333-8333-333333333333'

describe('canais de realtime', () => {
  it('valida um payload bem formado de cada canal', () => {
    expect(validarEvento('pedido.atualizado', { pedido_id: PEDIDO, loja_id: LOJA, status: 'em_preparo' }).success).toBe(true)
    expect(validarEvento('conversa.mensagem', { conversa_id: CONVERSA, loja_id: LOJA, direcao: 'entrada', autor: 'cliente' }).success).toBe(true)
    expect(validarEvento('conversa.handoff', { conversa_id: CONVERSA, loja_id: LOJA, status: 'humano' }).success).toBe(true)
  })

  it('REJEITA payload com PII (strict barra campo desconhecido como telefone/token)', () => {
    const r1 = validarEvento('conversa.mensagem', {
      conversa_id: CONVERSA,
      loja_id: LOJA,
      direcao: 'entrada',
      autor: 'cliente',
      telefone: '+5511999998888',
    })
    expect(r1.success).toBe(false)
    const r2 = validarEvento('pedido.atualizado', {
      pedido_id: PEDIDO,
      loja_id: LOJA,
      status: 'novo',
      token: 'segredo',
    })
    expect(r2.success).toBe(false)
  })

  it('rejeita status fora do enum', () => {
    expect(validarEvento('pedido.atualizado', { pedido_id: PEDIDO, loja_id: LOJA, status: 'inexistente' }).success).toBe(false)
  })

  it('o mapa cobre exatamente os tipos do enum tipoEvento', () => {
    expect(Object.keys(CANAIS_REALTIME).sort()).toEqual([...tipoEvento.options].sort())
  })
})

describe('EventoDominio (envelope)', () => {
  it('aceita envelope válido e rejeita chave extra (strict)', () => {
    const base = { tipo: 'pedido.atualizado', loja_id: LOJA, ocorrido_em: '2026-10-27T12:00:00Z', payload: {} }
    expect(EventoDominio.safeParse(base).success).toBe(true)
    expect(EventoDominio.safeParse({ ...base, extra: 1 }).success).toBe(false)
  })
  it('rejeita tipo desconhecido e data sem offset', () => {
    expect(EventoDominio.safeParse({ tipo: 'x.y', loja_id: LOJA, ocorrido_em: '2026-10-27T12:00:00Z', payload: {} }).success).toBe(false)
    expect(EventoDominio.safeParse({ tipo: 'pedido.atualizado', loja_id: LOJA, ocorrido_em: '2026-10-27', payload: {} }).success).toBe(false)
  })
})
