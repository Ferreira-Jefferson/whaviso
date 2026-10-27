// F4 api-core: integracao do esqueleto contra whaviso_dev (role whaviso_api).
// SEC-010/011 (current_user), SEC-081 (borda estrita), SEC-090 (headers/CORS), SEC-101 (rate limit).
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { consultar, sql } from '@whaviso/shared/db'
import { bancoAcessivel, fecharPools, poolApi } from './db'
import { verificadorFake } from './app'
import { construirApp } from '../src/app'
import { validarRegistry, type ModuloRota } from '../src/routes'
import { envSchema } from '../src/env'
import { Conflito, NaoEncontrado } from '../src/shared/http_errors'

const APP_URL = 'http://localhost:5173'
const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL,
  RATE_LIMIT_MAX: '1000',
})

const exemploRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  app.get('/ping', async () => ({ pong: true }))
  app.get('/privado', { preHandler: [app.autenticar] }, async (req) => req.usuario)
  app.get('/falta', async () => {
    throw new NaoEncontrado()
  })
  app.get('/duplicado', async () => {
    throw new Conflito()
  })
  app.get('/quebra', async () => {
    throw new Error('detalhe interno com segredo-xyz')
  })
  app.post(
    '/itens',
    {
      schema: {
        body: z.strictObject({
          nome: z.string().min(1).max(10),
          tipo: z.enum(['a', 'b']),
          preco_centavos: z.number().int().nonnegative(),
        }),
      },
    },
    async (req) => req.body,
  )
  app.get(
    '/limitado',
    { config: { rateLimit: { max: 2, timeWindow: '1 minute' } } },
    async () => ({ ok: true }),
  )
}

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[F4] whaviso_dev inacessivel: integracao do core PULADA.')

d('api-core (integracao)', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await construirApp({
      env,
      pool: poolApi,
      logger: false,
      verificador: verificadorFake,
      modulos: [{ prefixo: 'exemplo', plugin: exemploRoutes }],
    })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
    await fecharPools()
  })

  it('SEC-010/011: conecta como whaviso_api, nao superusuario', async () => {
    const [r] = await consultar<{ papel: string; super: boolean }>(
      poolApi,
      sql`select current_user::text as papel, (select rolsuper from pg_roles where rolname = current_user) as super`,
    )
    expect(r?.papel).toBe('whaviso_api')
    expect(r?.super).toBe(false)
  })

  it('/healthz 200 (select 1)', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, servico: 'api' })
  })

  it('rota inexistente: 404 no envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/nada' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { code: 'nao_encontrado', message: expect.any(String) } })
  })

  it('modulo do registry responde sob /v1/<prefixo>', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/exemplo/ping' })
    expect(res.json()).toEqual({ pong: true })
  })

  it('erros de dominio e inesperado saem no envelope, sem vazar interno', async () => {
    const a = await app.inject({ method: 'GET', url: '/v1/exemplo/falta' })
    expect(a.statusCode).toBe(404)
    const b = await app.inject({ method: 'GET', url: '/v1/exemplo/duplicado' })
    expect(b.statusCode).toBe(409)
    expect(b.json().error.code).toBe('conflito')
    const c = await app.inject({ method: 'GET', url: '/v1/exemplo/quebra' })
    expect(c.statusCode).toBe(500)
    expect(c.json()).toEqual({ error: { code: 'erro_interno', message: 'Erro interno' } })
    expect(c.body).not.toContain('segredo-xyz')
    expect(c.body).not.toContain('stack')
  })

  it('rota protegida: 401 sem token e com token invalido, 200 com token', async () => {
    const sem = await app.inject({ method: 'GET', url: '/v1/exemplo/privado' })
    expect(sem.statusCode).toBe(401)
    expect(sem.json().error.code).toBe('nao_autorizado')
    const ok = await app.inject({
      method: 'GET',
      url: '/v1/exemplo/privado',
      headers: { authorization: 'Bearer 11111111-1111-1111-1111-111111111111' },
    })
    expect(ok.statusCode).toBe(200)
  })

  describe('SEC-081: borda estrita', () => {
    const valido = { nome: 'abc', tipo: 'a', preco_centavos: 100 }
    const post = (payload: unknown) =>
      app.inject({ method: 'POST', url: '/v1/exemplo/itens', payload: payload as object })

    it('aceita payload valido', async () => {
      expect((await post(valido)).statusCode).toBe(200)
    })
    it.each([
      ['tipo errado', { ...valido, preco_centavos: 'x' }],
      ['tamanho', { ...valido, nome: 'a'.repeat(11) }],
      ['enum', { ...valido, tipo: 'z' }],
      ['chave extra', { ...valido, papel: 'admin' }],
      ['centavos fracionado', { ...valido, preco_centavos: 1.5 }],
    ])('rejeita %s no envelope 400', async (_n, corpo) => {
      const res = await post(corpo)
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('entrada_invalida')
    })
    it('JSON malformado: 400 generico, sem eco', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/exemplo/itens',
        headers: { 'content-type': 'application/json' },
        payload: '{"nome": segredo-xyz',
      })
      expect(res.statusCode).toBe(400)
      expect(res.body).not.toContain('segredo-xyz')
      expect(res.json().error).toBeDefined()
    })
  })

  describe('SEC-090: headers e CORS', () => {
    it('headers de seguranca presentes', async () => {
      const res = await app.inject({ method: 'GET', url: '/healthz' })
      expect(res.headers['strict-transport-security']).toContain('max-age=')
      expect(res.headers['content-security-policy']).toContain("default-src 'none'")
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['x-frame-options']).toBe('DENY')
      expect(res.headers['referrer-policy']).toBe('no-referrer')
      expect(res.headers['x-powered-by']).toBeUndefined()
    })
    it('CORS libera so o APP_URL', async () => {
      const ok = await app.inject({ method: 'GET', url: '/healthz', headers: { origin: APP_URL } })
      expect(ok.headers['access-control-allow-origin']).toBe(APP_URL)
      const mau = await app.inject({
        method: 'GET',
        url: '/healthz',
        headers: { origin: 'https://evil.example' },
      })
      expect(mau.headers['access-control-allow-origin']).toBeUndefined()
      const pre = await app.inject({
        method: 'OPTIONS',
        url: '/v1/exemplo/itens',
        headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
      })
      expect(pre.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  it('SEC-101: rate limit por rota (429 no envelope)', async () => {
    const codigos: number[] = []
    let ultimo = ''
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({ method: 'GET', url: '/v1/exemplo/limitado' })
      codigos.push(res.statusCode)
      ultimo = res.body
    }
    expect(codigos).toEqual([200, 200, 429, 429])
    expect(JSON.parse(ultimo).error.code).toBe('limite_excedido')
  })
})

describe('registry de rotas', () => {
  const plugin: FastifyPluginAsync = async () => {}
  it('falha com prefixo duplicado', () => {
    const mods: ModuloRota[] = [
      { prefixo: 'a', plugin },
      { prefixo: 'a', plugin },
    ]
    expect(() => validarRegistry(mods)).toThrow(/duplicado/)
  })
  it('falha com prefixo malformado e aceita registry valido', () => {
    expect(() => validarRegistry([{ prefixo: '/x', plugin }])).toThrow(/invalido/)
    expect(() => validarRegistry([{ prefixo: 'a', plugin }, { prefixo: 'b', plugin }])).not.toThrow()
  })
})
