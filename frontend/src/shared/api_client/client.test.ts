import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { criarApiClient, corpoSemLojaId, retryTransitorio } from './client'
import { ApiError } from './errors'
import { definirLojaAtiva } from './loja_ativa'

const LOJA = '11111111-1111-4111-8111-111111111111'

function resp(status: number, corpo?: unknown, headers: Record<string, string> = {}) {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers })
}

function montar(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof criarApiClient>[0]> = {}) {
  const aoSessaoExpirada = vi.fn()
  const renovarToken = vi.fn(async () => 'novo-token' as string | null)
  const client = criarApiClient({
    baseUrl: 'http://api.test',
    getToken: async () => 'tok',
    renovarToken,
    aoSessaoExpirada,
    fetchImpl,
    ...extra,
  })
  return { client, aoSessaoExpirada, renovarToken }
}

afterEach(() => definirLojaAtiva(null))

describe('api_client', () => {
  it('envia Bearer e x-loja-id, e valida a resposta com o schema', async () => {
    definirLojaAtiva(LOJA)
    const f = vi.fn(async () => resp(200, { n: 1 }))
    const { client } = montar(f as unknown as typeof fetch)
    const r = await client.get<{ n: number }>('/pedidos', { schema: z.object({ n: z.number() }) })
    expect(r).toEqual({ n: 1 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/v1/pedidos')
    const h = init.headers as Record<string, string>
    expect(h.Authorization).toBe('Bearer tok')
    expect(h['x-loja-id']).toBe(LOJA)
  })

  it('rota publica nao envia credencial nem loja', async () => {
    definirLojaAtiva(LOJA)
    const f = vi.fn(async () => resp(200, {}))
    const { client } = montar(f as unknown as typeof fetch, { prefixo: '' })
    await client.get('/healthz', { publico: true })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api.test/healthz')
    const h = init.headers as Record<string, string>
    expect(h.Authorization).toBeUndefined()
    expect(h['x-loja-id']).toBeUndefined()
  })

  it('SEC-001/002: loja_id no corpo e recusado antes de sair a requisicao', async () => {
    const f = vi.fn(async () => resp(200, {}))
    const { client } = montar(f as unknown as typeof fetch)
    await expect(client.post('/pedidos', { body: { itens: [{ loja_id: LOJA }] } })).rejects.toThrow(/loja_id/)
    expect(f).not.toHaveBeenCalled()
    expect(corpoSemLojaId({ a: { b: [1, { c: 2 }] } })).toBe(true)
  })

  it('traduz o envelope de erro para ApiError tipado', async () => {
    const f = vi.fn(async () => resp(422, { error: { code: 'regra', message: 'Nao pode' } }))
    const { client } = montar(f as unknown as typeof fetch)
    const e = await client.post('/x', { body: {} }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ code: 'regra', message: 'Nao pode', status: 422 })
  })

  it('erro fora do envelope vira erro_inesperado; 429 le Retry-After', async () => {
    const f = vi.fn(async () => resp(429, { x: 1 }, { 'retry-after': '7' }))
    const { client } = montar(f as unknown as typeof fetch)
    const e = (await client.get('/x').catch((x: unknown) => x)) as ApiError
    expect(e.code).toBe('erro_inesperado')
    expect(e.isRateLimited).toBe(true)
    expect(e.retryAfterSegundos).toBe(7)
  })

  it('403 e tratado como proibido', async () => {
    const f = vi.fn(async () => resp(403, { error: { code: 'proibido', message: 'Sem acesso' } }))
    const { client } = montar(f as unknown as typeof fetch)
    const e = (await client.get('/x').catch((x: unknown) => x)) as ApiError
    expect(e.isForbidden).toBe(true)
  })

  it('resposta fora do contrato falha de forma visivel', async () => {
    const f = vi.fn(async () => resp(200, { n: 'texto' }))
    const { client } = montar(f as unknown as typeof fetch)
    const e = (await client.get('/x', { schema: z.object({ n: z.number() }) }).catch((x: unknown) => x)) as ApiError
    expect(e.code).toBe('resposta_invalida')
  })

  it('SEC-040: 401 renova uma vez e repete com o novo token', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(resp(401, { error: { code: 'nao_autorizado', message: 'x' } }))
      .mockResolvedValueOnce(resp(200, { ok: true }))
    const { client, renovarToken, aoSessaoExpirada } = montar(f as unknown as typeof fetch)
    expect(await client.get('/x')).toEqual({ ok: true })
    expect(renovarToken).toHaveBeenCalledTimes(1)
    const h2 = (f.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(h2.Authorization).toBe('Bearer novo-token')
    expect(aoSessaoExpirada).not.toHaveBeenCalled()
  })

  it('SEC-040: 401 persistente apos o refresh faz logout (sem laco)', async () => {
    const f = vi.fn(async () => resp(401, { error: { code: 'nao_autorizado', message: 'x' } }))
    const { client, renovarToken, aoSessaoExpirada } = montar(f as unknown as typeof fetch)
    const e = (await client.get('/x').catch((x: unknown) => x)) as ApiError
    expect(e.code).toBe('sessao_expirada')
    expect(f).toHaveBeenCalledTimes(2)
    expect(renovarToken).toHaveBeenCalledTimes(1)
    expect(aoSessaoExpirada).toHaveBeenCalledTimes(1)
  })

  it('SEC-040: refresh que falha faz logout', async () => {
    const f = vi.fn(async () => resp(401, { error: { code: 'nao_autorizado', message: 'x' } }))
    const { client, aoSessaoExpirada } = montar(f as unknown as typeof fetch, { renovarToken: async () => null })
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'sessao_expirada' })
    expect(f).toHaveBeenCalledTimes(1)
    expect(aoSessaoExpirada).toHaveBeenCalledTimes(1)
  })

  it('SEC-040: sem token nao sai requisicao protegida', async () => {
    const f = vi.fn(async () => resp(200, {}))
    const { client, aoSessaoExpirada } = montar(f as unknown as typeof fetch, { getToken: async () => null })
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'sessao_expirada' })
    expect(f).not.toHaveBeenCalled()
    expect(aoSessaoExpirada).toHaveBeenCalled()
  })

  it('falha de rede vira ApiError transitorio', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('failed')
    })
    const { client } = montar(f as unknown as typeof fetch)
    const e = (await client.get('/x').catch((x: unknown) => x)) as ApiError
    expect(e.code).toBe('rede_indisponivel')
    expect(retryTransitorio(0, e)).toBe(true)
    expect(retryTransitorio(2, e)).toBe(false)
    expect(retryTransitorio(0, new ApiError('x', 'y', 422))).toBe(false)
  })

  it('SEC-020/024: nao loga corpo nem headers', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    const f = vi.fn(async () => resp(500, { error: { code: 'x', message: 'y' } }))
    const { client } = montar(f as unknown as typeof fetch)
    await client.post('/x', { body: { segredo: 'abc' } }).catch(() => undefined)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    spies.forEach((s) => s.mockRestore())
  })
})
