// Catalogo de planos (admin) e congelamento do valor na assinatura. Integracao com Postgres local.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarOperador, criarUsuario, fecharPools, limpar, novoCenario,
  poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarCobrancaRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

d('plataforma_cobranca: planos (integracao)', () => {
  const cen = novoCenario()
  const sufixo = Math.random().toString(36).slice(2, 8)
  let app: Awaited<ReturnType<typeof construirApp>>
  let admin: string, comum: string, conta: string
  const planosCriados: string[] = []

  const req = (quem: string, metodo: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/plataforma-cobranca${url}`,
      headers: { authorization: `Bearer ${quem}` },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('planos-teste', 'error'),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'plataforma-cobranca', plugin: criarCobrancaRoutes() }],
    })
    await app.ready()
    admin = await criarUsuario(cen)
    await criarOperador(admin, 'admin')
    comum = await criarUsuario(cen)
    await criarOperador(comum, 'operador')
    conta = await criarConta(cen, await criarUsuario(cen))
    await criarLoja(conta)
  })

  afterAll(async () => {
    await app.close()
    await poolSuper.query('delete from public.eventos where entidade_id in (select id from public.assinaturas where conta_id = $1)', [conta]).catch(() => {})
    await poolSuper.query('delete from public.assinaturas where conta_id = $1', [conta]).catch(() => {})
    await poolSuper.query('delete from public.planos where id = any($1::uuid[])', [planosCriados]).catch(() => {})
    await limpar(cen)
    await fecharPools()
  })

  let planoId = ''

  it('admin cria plano (centavos + inclui) e ele aparece na lista', async () => {
    const r = await req(admin, 'POST', '/planos', {
      nome: `Plano ${sufixo}`, valor_centavos: 99000, inclui: ['Atendente com IA', '2 lojas'],
    })
    expect(r.statusCode, r.body).toBe(201)
    const p = r.json()
    planoId = p.id
    planosCriados.push(p.id)
    expect(p).toMatchObject({ valor_centavos: 99000, ativo: true, inclui: ['Atendente com IA', '2 lojas'] })
    const lista = (await req(admin, 'GET', '/planos')).json() as Array<{ id: string }>
    expect(lista.some((x) => x.id === planoId)).toBe(true)
  })

  it('nome duplicado vira 409 e valor nao inteiro e recusado', async () => {
    const dup = await req(admin, 'POST', '/planos', { nome: `plano ${sufixo}`, valor_centavos: 1 })
    expect(dup.statusCode).toBe(409)
    const frac = await req(admin, 'POST', '/planos', { nome: `X ${sufixo}`, valor_centavos: 10.5 })
    expect(frac.statusCode).toBe(400)
  })

  it('operador comum recebe 403 em todas as rotas de planos', async () => {
    expect((await req(comum, 'GET', '/planos')).statusCode).toBe(403)
    expect((await req(comum, 'POST', '/planos', { nome: 'Z', valor_centavos: 1 })).statusCode).toBe(403)
    expect((await req(comum, 'PATCH', `/planos/${planoId}`, { ativo: false })).statusCode).toBe(403)
  })

  it('assinatura com plano congela o valor: reajuste do plano nao a altera', async () => {
    const r = await req(admin, 'POST', '/assinaturas', {
      conta_id: conta, status: 'ativa', plano_id: planoId, dia_vencimento: 5,
    })
    expect(r.statusCode, r.body).toBe(201)
    const a = r.json()
    expect(a.valor_mensal_centavos).toBe(99000)

    const ed = await req(admin, 'PATCH', `/planos/${planoId}`, { valor_centavos: 150000, nome: `Plano ${sufixo} v2` })
    expect(ed.statusCode, ed.body).toBe(200)
    expect(ed.json().valor_centavos).toBe(150000)

    const { rows } = await poolSuper.query<{ valor_mensal_centavos: number; plano_id: string }>(
      'select valor_mensal_centavos, plano_id from public.assinaturas where id = $1', [a.id])
    expect(rows[0]).toEqual({ valor_mensal_centavos: 99000, plano_id: planoId })
  })

  it('valor manual continua valendo; sem plano nem valor usa o padrao', async () => {
    const outraConta = await criarConta(cen, await criarUsuario(cen))
    const manual = await req(admin, 'POST', '/assinaturas', {
      conta_id: outraConta, plano_id: planoId, valor_mensal_centavos: 12345,
    })
    expect(manual.json().valor_mensal_centavos).toBe(12345)
    const padrao = await req(admin, 'POST', '/assinaturas', { conta_id: outraConta })
    expect(padrao.json().valor_mensal_centavos).toBe(70000)
    await poolSuper.query('delete from public.eventos where entidade_id in (select id from public.assinaturas where conta_id = $1)', [outraConta])
    await poolSuper.query('delete from public.assinaturas where conta_id = $1', [outraConta])
  })

  it('inativar plano o tira da escolha, mas nao toca assinaturas existentes', async () => {
    const off = await req(admin, 'PATCH', `/planos/${planoId}`, { ativo: false })
    expect(off.json().ativo).toBe(false)
    const nova = await req(admin, 'POST', '/assinaturas', { conta_id: conta, plano_id: planoId })
    expect(nova.statusCode).toBe(422)
    expect(nova.json().error.code).toBe('plano_inativo')
    const lista = (await req(admin, 'GET', `/assinaturas?conta_id=${conta}`)).json() as Array<{ valor_mensal_centavos: number }>
    expect(lista[0]!.valor_mensal_centavos).toBe(99000)
    const on = await req(admin, 'PATCH', `/planos/${planoId}`, { ativo: true })
    expect(on.json().ativo).toBe(true)
  })

  it('patch de assinatura com plano copia o valor do plano; plano inexistente 404', async () => {
    const a = (await req(admin, 'GET', `/assinaturas?conta_id=${conta}`)).json()[0]
    const r = await req(admin, 'PATCH', `/assinaturas/${a.id}`, { plano_id: planoId })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().valor_mensal_centavos).toBe(150000)
    const nf = await req(admin, 'PATCH', `/assinaturas/${a.id}`, { plano_id: '00000000-0000-4000-8000-000000000000' })
    expect(nf.statusCode).toBe(404)
    expect((await req(admin, 'PATCH', '/planos/00000000-0000-4000-8000-000000000000', { ativo: false })).statusCode).toBe(404)
  })
})
