import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  creditarConta,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }

describe('billing carteira (integração)', () => {
  let u: string

  beforeAll(async () => {
    u = await criarUsuario('Billing')
  })
  afterAll(async () => {
    await limparUsuario(u)
    await encerrarPools()
  })

  it('carteira: conta nasce com a cortesia e a curva do catálogo vem para o slider', async () => {
    const app = await criarAppTeste(u)
    const r = await app.inject({ method: 'GET', url: '/v1/billing/carteira', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const body = r.json() as {
      carteira: { saldo_livre: number; reservado: number; em_hold: number; consumido: number; ja_comprou: boolean }
      catalogo: {
        envios_min: number
        envios_max: number
        curva: { envios: number; centavos: number }[]
      }
    }
    // Cortesia inicial do free (migration 0057 = 5 envios).
    expect(body.carteira.saldo_livre).toBe(5)
    expect(body.carteira.reservado).toBe(0)
    expect(body.carteira.em_hold).toBe(0)
    expect(body.carteira.ja_comprou).toBe(false)
    // Curva de marcos do catálogo (faixa 10..250; R$/envio cai de 0,99 a 0,70; migration 0058).
    expect(body.catalogo.envios_min).toBe(10)
    expect(body.catalogo.envios_max).toBe(250)
    expect(body.catalogo.curva).toEqual([
      { envios: 10, centavos: 99 },
      { envios: 25, centavos: 95 },
      { envios: 50, centavos: 90 },
      { envios: 100, centavos: 85 },
      { envios: 150, centavos: 80 },
      { envios: 200, centavos: 75 },
      { envios: 250, centavos: 70 },
    ])
  })

  it('carteira reflete o crédito do owner (ja_comprou vira true)', async () => {
    await creditarConta(u, 50)
    const app = await criarAppTeste(u)
    const r = await app.inject({ method: 'GET', url: '/v1/billing/carteira', headers: AUTH })
    await app.close()
    const carteira = r.json().carteira as { saldo_livre: number; ja_comprou: boolean }
    expect(carteira.saldo_livre).toBe(55) // 5 de cortesia + 50 creditados
    expect(carteira.ja_comprou).toBe(true)
  })

  it('extrato lista os lançamentos da conta, ordem cronológica decrescente', async () => {
    const app = await criarAppTeste(u)
    const r = await app.inject({ method: 'GET', url: '/v1/billing/extrato', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const body = r.json() as { itens: Array<{ tipo: string; quantidade: number }>; total: number }
    expect(body.total).toBeGreaterThanOrEqual(2) // cortesia + crédito do owner
    const tipos = body.itens.map((i) => i.tipo)
    expect(tipos).toContain('credito_owner')
    expect(tipos).toContain('cortesia')
    // O lançamento mais recente (topo) é o crédito do owner.
    expect(body.itens[0]!.tipo).toBe('credito_owner')
  })

  it('carteira/extrato exigem autenticação (401 sem token)', async () => {
    const app = await criarAppTeste(u)
    const c = await app.inject({ method: 'GET', url: '/v1/billing/carteira' })
    const e = await app.inject({ method: 'GET', url: '/v1/billing/extrato' })
    await app.close()
    expect(c.statusCode).toBe(401)
    expect(e.statusCode).toBe(401)
  })

  it('não há endpoint de auto-crédito: o usuário nunca se credita (rotas antigas sumiram)', async () => {
    const app = await criarAppTeste(u)
    const assinar = await app.inject({ method: 'POST', url: '/v1/billing/assinar', headers: AUTH, payload: { plano_id: 'plus', unidades: 50 } })
    const checkout = await app.inject({ method: 'POST', url: '/v1/billing/checkout', headers: AUTH })
    await app.close()
    // Rotas removidas: 404 (não existem mais).
    expect(assinar.statusCode).toBe(404)
    expect(checkout.statusCode).toBe(404)
    // Defesa: o saldo não mudou por tentar bater nas rotas antigas.
    const { rows } = await poolSuper.query<{ saldo_livre: number }>(
      `select saldo_livre from public.creditos_carteira where profile_id = $1`,
      [u],
    )
    expect(rows[0]!.saldo_livre).toBe(55)
  })
})
