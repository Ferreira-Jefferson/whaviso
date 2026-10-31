// Pool de chaves de LLM da plataforma (admin). Integracao no Postgres LOCAL.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarOperador, criarUsuario, fecharPools, limpar, novoCenario,
  poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarRotasConfigLlm } from './routes'
import { criarCifraLlm } from './cifra'
import type { RegistroValidadores } from './provedores'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const MASTER_KEY = 'llm-master-key-de-teste-pool-0123456789abcdef'
const cifra = criarCifraLlm(MASTER_KEY)
const validadores: RegistroValidadores = {}

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

d('configuracoes_llm: pool de chaves da plataforma (integracao)', () => {
  const cen = novoCenario()
  const sufixo = Math.random().toString(36).slice(2, 8)
  let app: Awaited<ReturnType<typeof construirApp>>
  let admin: string, comum: string, lojaId: string

  const req = (quem: string, metodo: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/llm${url}`,
      headers: { authorization: `Bearer ${quem}` },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('llm-pool-teste', 'error'),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'llm', plugin: criarRotasConfigLlm({ cifra, validadores }) }],
    })
    await app.ready()
    admin = await criarUsuario(cen)
    await criarOperador(admin, 'admin')
    comum = await criarUsuario(cen)
    await criarOperador(comum, 'operador')
    const conta = await criarConta(cen, await criarUsuario(cen))
    lojaId = await criarLoja(conta)
  })

  afterAll(async () => {
    await app.close()
    await poolSuper.query('delete from public.credenciais_llm where loja_id = $1', [lojaId]).catch(() => {})
    await poolSuper.query("delete from public.credenciais_llm_pool where nome like $1", [`Pool teste ${sufixo}%`]).catch(() => {})
    await limpar(cen)
    await fecharPools()
  })

  let poolId = ''

  it('admin cria chave do pool: aparece na lista, a chave nunca volta nem fica em claro no banco', async () => {
    const chave = `sk-or-pool-${randomUUID()}`
    const r = await req(admin, 'POST', '/pool', { nome: `Pool teste ${sufixo}`, chave })
    expect(r.statusCode, r.body).toBe(201)
    const item = r.json()
    poolId = item.id
    expect(item).toMatchObject({ nome: `Pool teste ${sufixo}`, provedor: 'openrouter', ativo: true })
    expect(r.body).not.toContain(chave)

    const lista = (await req(admin, 'GET', '/pool')).json() as Array<{ id: string }>
    expect(lista.some((p) => p.id === poolId)).toBe(true)

    const { rows } = await poolSuper.query('select chave_cifrada from public.credenciais_llm_pool where id = $1', [poolId])
    const cifrado = rows[0].chave_cifrada as Buffer
    expect(cifrado.toString('utf8')).not.toContain(chave)
  })

  it('operador comum recebe 403 em todas as rotas do pool', async () => {
    expect((await req(comum, 'GET', '/pool')).statusCode).toBe(403)
    expect((await req(comum, 'POST', '/pool', { nome: 'x', chave: 'y' })).statusCode).toBe(403)
    expect((await req(comum, 'PATCH', `/pool/${poolId}`, { ativo: false })).statusCode).toBe(403)
    expect((await req(comum, 'PUT', `/pool/atribuicoes/${lojaId}`, { pool_chave_id: poolId })).statusCode).toBe(403)
  })

  it('nome duplicado (case-insensitive) vira 409', async () => {
    const r = await req(admin, 'POST', '/pool', { nome: `pool teste ${sufixo}`, chave: 'sk-or-outra' })
    expect(r.statusCode).toBe(409)
  })

  it('admin atribui a chave do pool a uma loja: a loja passa a aparecer configurada', async () => {
    const r = await req(admin, 'PUT', `/pool/atribuicoes/${lojaId}`, { pool_chave_id: poolId })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ configurada: true, provedor: 'openrouter' })

    const { rows } = await poolSuper.query(
      'select chave_cifrada, pool_chave_id from public.credenciais_llm where loja_id = $1', [lojaId],
    )
    expect(rows[0]).toMatchObject({ chave_cifrada: null, pool_chave_id: poolId })
  })

  it('atribuir chave do pool INATIVA e recusado (422)', async () => {
    await req(admin, 'PATCH', `/pool/${poolId}`, { ativo: false })
    const r = await req(admin, 'PUT', `/pool/atribuicoes/${lojaId}`, { pool_chave_id: poolId })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error.code).toBe('pool_chave_inativa')
    await req(admin, 'PATCH', `/pool/${poolId}`, { ativo: true })
  })

  it('id de pool inexistente: 404 no ajuste e na atribuicao', async () => {
    const idFalso = randomUUID()
    expect((await req(admin, 'PATCH', `/pool/${idFalso}`, { ativo: false })).statusCode).toBe(404)
    expect((await req(admin, 'PUT', `/pool/atribuicoes/${lojaId}`, { pool_chave_id: idFalso })).statusCode).toBe(404)
  })
})
