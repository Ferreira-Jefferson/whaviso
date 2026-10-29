// Integracao: CRUD da allowlist pelo operador (permissao cobranca:gerir) e enfileiramento do
// boas-vindas ao aprovar. Membro de loja (nao operador) e barrado (403).
import { randomUUID } from 'node:crypto'
import type { InjectOptions } from 'fastify'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario,
  fecharPools, limpar, novoCenario, poolApi, poolSuper, type Cenario,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarAcessosLoginRoutes } from './routes'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

type App = Awaited<ReturnType<typeof construirApp>>

d('acessos_login: allowlist pelo operador (integracao)', () => {
  let app: App
  const c: Cenario = novoCenario()
  const emails: string[] = []
  let operador: string
  let membroLoja: string

  beforeAll(async () => {
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado',
      SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173',
      RATE_LIMIT_MAX: '100000',
    })
    app = await construirApp({
      env, pool: poolApi, logger: false, verificador: verificadorFake,
      modulos: [{ prefixo: 'acessos-login', plugin: criarAcessosLoginRoutes() }],
    })
    await app.ready()

    const u = await criarUsuario(c)
    operador = u
    await criarOperador(u, 'operador')
    // Um membro de loja qualquer (nao operador) para o teste de 403.
    const dono = await criarUsuario(c)
    const contaId = await criarConta(c, dono)
    const lojaId = await criarLoja(contaId)
    membroLoja = await criarUsuario(c)
    await criarMembro(contaId, membroLoja, 'gerente', lojaId)
  })

  afterAll(async () => {
    await app?.close()
    for (const e of emails) {
      await poolSuper.query('delete from public.emails_outbox where para = $1', [e]).catch(() => {})
      await poolSuper.query('delete from public.acessos_permitidos where email = $1', [e]).catch(() => {})
    }
    await limpar(c)
    await fecharPools()
  })

  let seq = 0
  function chamar(user: string | null, method: InjectOptions['method'], url: string, payload?: object) {
    return app.inject({
      method,
      url: `/v1/acessos-login${url}`,
      headers: {
        'x-forwarded-for': `10.20.${seq++ & 255}.1`,
        ...(user ? { authorization: `Bearer ${user}` } : {}),
      },
      ...(payload ? { payload } : {}),
    })
  }

  it('membro de loja (nao operador) e barrado (403)', async () => {
    expect((await chamar(membroLoja, 'GET', '/')).statusCode).toBe(403)
    expect((await chamar(null, 'GET', '/')).statusCode).toBe(401)
  })

  it('adiciona, lista, aprova (enfileira boas-vindas) e revoga', async () => {
    const email = `al.${randomUUID().slice(0, 8)}@exemplo.com`
    emails.push(email)

    // adicionar
    const add = await chamar(operador, 'POST', '/', { email: email.toUpperCase(), observacao: 'teste' })
    expect(add.statusCode).toBe(201)
    const dto = add.json()
    expect(dto).toMatchObject({ email, status: 'pendente', origem: 'admin' })

    // duplicado -> 409
    expect((await chamar(operador, 'POST', '/', { email })).statusCode).toBe(409)

    // listar com filtro pendente contem o novo
    const lista = await chamar(operador, 'GET', '/?status=pendente')
    expect(lista.statusCode).toBe(200)
    expect((lista.json() as { id: string }[]).some((x) => x.id === dto.id)).toBe(true)

    // aprovar -> aprovado + boas-vindas enfileirado
    const ap = await chamar(operador, 'POST', `/${dto.id}/aprovar`)
    expect(ap.statusCode).toBe(200)
    expect(ap.json()).toMatchObject({ status: 'aprovado', boas_vindas_enviado_em: expect.any(String) })
    const ob = await poolSuper.query('select template from public.emails_outbox where para = $1', [email])
    expect(ob.rows.map((r) => r.template)).toEqual(['boas_vindas'])

    // reaprovar nao reenfileira (dedupe + guarda)
    await chamar(operador, 'POST', `/${dto.id}/aprovar`)
    const ob2 = await poolSuper.query('select count(*)::int as n from public.emails_outbox where para = $1', [email])
    expect(ob2.rows[0].n).toBe(1)

    // revogar
    const rv = await chamar(operador, 'POST', `/${dto.id}/revogar`)
    expect(rv.statusCode).toBe(200)
    expect(rv.json().status).toBe('revogado')
  })

  it('aprovar id inexistente -> 404', async () => {
    expect((await chamar(operador, 'POST', `/${randomUUID()}/aprovar`)).statusCode).toBe(404)
  })
})
