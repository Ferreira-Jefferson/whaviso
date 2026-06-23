import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }

describe('billing (integração)', () => {
  let u: string

  beforeAll(async () => {
    u = await criarUsuario('Billing')
  })
  afterAll(async () => {
    await limparUsuario(u)
    await encerrarPools()
  })

  it('planos: catálogo dos 4 planos com alavancas (balde único)', async () => {
    const app = await criarAppTeste(null)
    const r = await app.inject({ method: 'GET', url: '/v1/billing/planos' })
    await app.close()
    expect(r.statusCode).toBe(200)
    const planos = r.json().planos as Array<Record<string, unknown>>
    const ids = planos.map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(['free', 'start', 'profissional', 'plus']))

    const free = planos.find((p) => p.id === 'free')!
    expect(free.preco_centavos).toBe(0)
    expect(free.capacidade_agenda).toBe(50)
    expect(free.somente_leitura).toBe(true)

    const start = planos.find((p) => p.id === 'start')!
    expect(start.preco_centavos).toBe(990)
    expect(start.capacidade_agenda).toBe(100)
    expect(start.cadencia_configuravel).toBe(false)

    const prof = planos.find((p) => p.id === 'profissional')!
    expect(prof.capacidade_agenda).toBe(150)
    expect(prof.cadencia_configuravel).toBe(true)
    expect(prof.totais_periodo).toBe(true)

    const plus = planos.find((p) => p.id === 'plus')!
    expect(plus.por_unidade).toBe(true)
    expect(plus.agenda_por_unidade).toBe(10)
    expect(plus.ativaveis_por_unidade).toBe(1)
  })

  it('conta nasce no free (signup cria a linha de assinatura)', async () => {
    const app = await criarAppTeste(u)
    const a = await app.inject({ method: 'GET', url: '/v1/billing/assinatura', headers: AUTH })
    await app.close()
    expect(a.statusCode).toBe(200)
    expect(a.json().plano_id).toBe('free')
    expect(a.json().somente_leitura).toBe(true)
    expect(a.json().capacidade_agenda).toBe(50)
  })

  it('assinar Plus grava unidades e congela o preço total (preço de unidade * unidades)', async () => {
    const app = await criarAppTeste(u)
    const precoUnidade = (
      (await app.inject({ method: 'GET', url: '/v1/billing/planos' })).json().planos as Array<{
        id: string
        preco_centavos: number
      }>
    ).find((p) => p.id === 'plus')!.preco_centavos

    const r = await app.inject({
      method: 'POST',
      url: '/v1/billing/assinar',
      headers: AUTH,
      payload: { plano_id: 'plus', unidades: 3 },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().unidades).toBe(3)
    expect(r.json().preco_centavos).toBe(precoUnidade * 3)

    const a = await app.inject({ method: 'GET', url: '/v1/billing/assinatura', headers: AUTH })
    await app.close()
    expect(a.json().plano_id).toBe('plus')
    expect(a.json().unidades).toBe(3)
    // Plus com 3 unidades → agenda 30 (10/unidade), vagas ativas 3 (1/unidade).
    expect(a.json().capacidade_agenda).toBe(30)
  })

  it('assinar Plus sem unidades → 400', async () => {
    const app = await criarAppTeste(u)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/billing/assinar',
      headers: AUTH,
      payload: { plano_id: 'plus' },
    })
    await app.close()
    expect(r.statusCode).toBe(400)
  })

  it('assinar plano inexistente → 400 (enum recusa)', async () => {
    const app = await criarAppTeste(u)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/billing/assinar',
      headers: AUTH,
      payload: { plano_id: 'personalizado' },
    })
    await app.close()
    expect(r.statusCode).toBe(400)
  })

  it('checkout cria fatura pendente e webhook pago ativa a assinatura', async () => {
    const app = await criarAppTeste(u)
    await app.inject({
      method: 'POST',
      url: '/v1/billing/assinar',
      headers: AUTH,
      payload: { plano_id: 'profissional' },
    })
    const ck = await app.inject({ method: 'POST', url: '/v1/billing/checkout', headers: AUTH })
    expect(ck.statusCode).toBe(200)
    expect(ck.json().status).toBe('pendente')

    const { rows } = await poolSuper.query<{ provedor_ref: string; valor_centavos: number }>(
      `select provedor_ref, valor_centavos from public.pagamentos
       where profile_id = $1 order by criado_em desc limit 1`,
      [u],
    )
    expect(rows[0]!.valor_centavos).toBe(2900) // preço congelado do profissional (R$ 29)
    const ref = rows[0]!.provedor_ref

    const wh = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      payload: { provedor_ref: ref, status: 'pago' },
    })
    await app.close()
    expect(wh.statusCode).toBe(200)

    const assi = await poolSuper.query<{ status: string }>(
      `select status from public.assinaturas where profile_id = $1`,
      [u],
    )
    expect(assi.rows[0]!.status).toBe('ativa')
  })

  it('checkout no free → 422 (free não paga)', async () => {
    const app = await criarAppTeste(u)
    await app.inject({
      method: 'POST',
      url: '/v1/billing/assinar',
      headers: AUTH,
      payload: { plano_id: 'free' },
    })
    const ck = await app.inject({ method: 'POST', url: '/v1/billing/checkout', headers: AUTH })
    await app.close()
    expect(ck.statusCode).toBe(422)
    expect(ck.json().error.code).toBe('sem_assinatura')
  })

  it('webhook não reconhecido → 400', async () => {
    const app = await criarAppTeste(null)
    const r = await app.inject({ method: 'POST', url: '/v1/billing/webhook', payload: { foo: 'bar' } })
    await app.close()
    expect(r.statusCode).toBe(400)
  })
})
