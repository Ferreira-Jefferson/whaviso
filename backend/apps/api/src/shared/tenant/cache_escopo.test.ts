// Cache curto de escopo: colapsa o burst de leituras do mesmo usuario numa so ida ao banco,
// respeita o TTL (revogacao volta a valer depois) e NUNCA cacheia falha (mantem fail-closed).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeitorEscopo, OperadorResolvido, VinculoLoja } from './leitor_escopo'
import { comCacheCurto, TTL_ESCOPO_MS } from './cache_escopo'

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

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('comCacheCurto', () => {
  it('coalesce o burst paralelo do mesmo usuario numa chamada so', async () => {
    const base = leitorFake()
    const cache = comCacheCurto(base)
    await Promise.all([
      cache.lojasDoUsuario('u1'),
      cache.lojasDoUsuario('u1'),
      cache.lojasDoUsuario('u1'),
    ])
    expect(base.chamadasLojas).toBe(1)
  })

  it('serve do cache chamadas sequenciais dentro do TTL', async () => {
    const base = leitorFake()
    const cache = comCacheCurto(base)
    await cache.lojasDoUsuario('u1')
    await cache.lojasDoUsuario('u1')
    expect(base.chamadasLojas).toBe(1)
  })

  it('rele o banco depois que o TTL expira (revogacao volta a valer)', async () => {
    const base = leitorFake()
    const cache = comCacheCurto(base)
    await cache.lojasDoUsuario('u1')
    vi.advanceTimersByTime(TTL_ESCOPO_MS + 1)
    await cache.lojasDoUsuario('u1')
    expect(base.chamadasLojas).toBe(2)
  })

  it('nao compartilha cache entre usuarios distintos', async () => {
    const base = leitorFake()
    const cache = comCacheCurto(base)
    await cache.lojasDoUsuario('u1')
    await cache.lojasDoUsuario('u2')
    expect(base.chamadasLojas).toBe(2)
  })

  it('nao cacheia falha: a proxima chamada tenta de novo', async () => {
    let tentativa = 0
    const base = leitorFake(async () => {
      tentativa += 1
      if (tentativa === 1) throw new Error('falha transitoria')
      return []
    })
    const cache = comCacheCurto(base)
    await expect(cache.lojasDoUsuario('u1')).rejects.toThrow('falha transitoria')
    await expect(cache.lojasDoUsuario('u1')).resolves.toEqual([])
    expect(base.chamadasLojas).toBe(2)
  })

  it('tem cache independente por metodo', async () => {
    const base = leitorFake()
    const cache = comCacheCurto(base)
    await cache.lojasDoUsuario('u1')
    await cache.operadorDoUsuario('u1')
    expect(base.chamadasLojas).toBe(1)
    expect(base.chamadasOperador).toBe(1)
  })
})
