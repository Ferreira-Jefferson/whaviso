// Fixa o comportamento INTENCIONAL do PDV (achado B7): uma venda vinculada a um pedido NAO tem o
// valor conferido contra o total do pedido. A gaveta e fisica e o lancamento e legitimo em
// pagamento parcial, split, troco e gorjeta, entao o operador digita o valor efetivamente recebido.
// Este teste documenta e trava essa decisao: se alguem passar a conferir o valor contra o pedido,
// ele quebra e forca a revisao da regra de negocio.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Writable } from 'node:stream'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar, novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { criarLogger } from '@whaviso/shared/logger'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarCaixaRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[caixa/B7] banco inacessivel: integracao PULADA.')

const destino = new Writable({ write(_c: Buffer, _e, cb) { cb() } })

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('caixa-b7', 'info', destino),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'caixa', plugin: criarCaixaRoutes() }],
  })
  await app.ready()
  return app
}

d('caixa B7: venda com pedido_id nao confere valor contra o total (design de PDV)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let dono: string, loja: string, pedidoId: string

  const chamar = (metodo: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/caixa${url}`,
      headers: { authorization: `Bearer ${dono}`, 'x-loja-id': loja },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    dono = await criarUsuario(cen)
    const conta = await criarConta(cen, dono)
    loja = await criarLoja(conta)
    lojas.push(loja)
    await criarMembro(conta, dono, 'dono', null)
    // Pedido de R$ 100,00 (10000 centavos).
    const r = await poolSuper.query<{ id: string }>(
      `insert into public.pedidos (loja_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1, 'B7', 'entregue', 10000, 10000) returning id`,
      [loja],
    )
    pedidoId = r.rows[0]!.id
    app = await montar()
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojas) {
      await poolSuper.query('delete from public.movimentos_caixa where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.caixas where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.pedidos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  it('aceita venda parcial (valor < total do pedido) vinculada ao pedido', async () => {
    const abrir = await chamar('POST', '/abrir', { saldo_inicial_centavos: 0 })
    expect(abrir.statusCode, abrir.body).toBe(201)
    const caixaId = abrir.json().id as string

    // Pedido vale 10000; registra apenas 3000 (pagamento parcial). Deve ser ACEITO.
    const parcial = await chamar('POST', `/${caixaId}/movimentos`, {
      tipo: 'venda', forma_pagamento: 'dinheiro', valor_centavos: 3000, pedido_id: pedidoId,
    })
    expect(parcial.statusCode, parcial.body).toBe(201)
    expect(parcial.json()).toMatchObject({ pedido_id: pedidoId, valor_centavos: 3000 })

    // Tambem aceita valor acima do total (ex.: gorjeta): nao ha trava de valor por design.
    const acima = await chamar('POST', `/${caixaId}/movimentos`, {
      tipo: 'venda', forma_pagamento: 'pix', valor_centavos: 12000, pedido_id: pedidoId,
    })
    expect(acima.statusCode, acima.body).toBe(201)
    expect(acima.json().valor_centavos).toBe(12000)
  })
})
