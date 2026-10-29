// Coalescencia de escopo: colapsa o burst SIMULTANEO de leituras do mesmo usuario numa so ida ao
// banco, sem janela de staleness (chamadas sequenciais releem, revogacao imediata) e sem cachear
// falha (mantem fail-closed).
import { describe, expect, it } from 'vitest'
import type { LeitorEscopo, OperadorResolvido, VinculoLoja } from './leitor_escopo'
import { comCoalescencia } from './cache_escopo'

interface LeitorFake extends LeitorEscopo {
  chamadasLojas: number
  chamadasOperador: number
}

function leitorFake(
  lojas: () => Promise<VinculoLoja[]> = async () => [],
  operador: () => Promise<OperadorResolvido | null> = async () => null,
): LeitorFake {
  const fake: LeitorFake = {
    chamadasLojas: 0,
    chamadasOperador: 0,
    lojasDoUsuario: () => {
      fake.chamadasLojas += 1
      return lojas()
    },
    operadorDoUsuario: () => {
      fake.chamadasOperador += 1
      return operador()
    },
  }
  return fake
}

describe('comCoalescencia', () => {
  it('coalesce o burst paralelo do mesmo usuario numa chamada so', async () => {
    const base = leitorFake()
    const cache = comCoalescencia(base)
    await Promise.all([
      cache.lojasDoUsuario('u1'),
      cache.lojasDoUsuario('u1'),
      cache.lojasDoUsuario('u1'),
    ])
    expect(base.chamadasLojas).toBe(1)
  })

  it('nao reusa entre chamadas sequenciais: rele o banco (revogacao imediata, sem staleness)', async () => {
    const base = leitorFake()
    const cache = comCoalescencia(base)
    await cache.lojasDoUsuario('u1')
    await cache.lojasDoUsuario('u1')
    expect(base.chamadasLojas).toBe(2)
  })

  it('nao compartilha a chamada em voo entre usuarios distintos', async () => {
    const base = leitorFake()
    const cache = comCoalescencia(base)
    await Promise.all([cache.lojasDoUsuario('u1'), cache.lojasDoUsuario('u2')])
    expect(base.chamadasLojas).toBe(2)
  })

  it('nao cacheia falha: a proxima chamada tenta de novo', async () => {
    let tentativa = 0
    const base = leitorFake(async () => {
      tentativa += 1
      if (tentativa === 1) throw new Error('falha transitoria')
      return []
    })
    const cache = comCoalescencia(base)
    await expect(cache.lojasDoUsuario('u1')).rejects.toThrow('falha transitoria')
    await expect(cache.lojasDoUsuario('u1')).resolves.toEqual([])
    expect(base.chamadasLojas).toBe(2)
  })

  it('coalesce cada metodo de forma independente', async () => {
    const base = leitorFake()
    const cache = comCoalescencia(base)
    await Promise.all([cache.lojasDoUsuario('u1'), cache.operadorDoUsuario('u1')])
    expect(base.chamadasLojas).toBe(1)
    expect(base.chamadasOperador).toBe(1)
  })
})
