// Integracao do modulo estoque_itens contra o Postgres local (role whaviso_api).
// Cobre controle (liga/desliga), lancamentos (entrada/saida/ajuste), estoque baixo, historico,
// isolamento por loja (SEC-001/002) e o decremento por venda (idempotente, nunca negativo).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import { comTransacao } from '@whaviso/shared/db'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { estoqueItensRoutes } from './routes'
import { decrementarPorVenda } from './venda'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[estoque_itens] banco inacessivel: integracao PULADA.')

async function novoItem(lojaId: string, nome = 'Item'): Promise<string> {
  const cat = await poolSuper.query<{ id: string }>(
    `insert into public.categorias (loja_id, nome) values ($1, $2) returning id`,
    [lojaId, 'Categoria'],
  )
  const item = await poolSuper.query<{ id: string }>(
    `insert into public.itens (loja_id, categoria_id, nome) values ($1, $2, $3) returning id`,
    [lojaId, cat.rows[0]!.id, nome],
  )
  return item.rows[0]!.id
}

d('modulo estoque_itens (integracao)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof construirApp>>
  let donoA: string, donoB: string
  let lojaA: string, lojaB: string
  let itemA: string

  const chamar = (
    user: string,
    loja: string | null,
    metodo: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method: metodo,
      url: `/v1/estoque_itens${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    lojas.push(lojaA, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaB, donoB, 'dono', null)
    itemA = await novoItem(lojaA, 'Coxinha')
    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('estoque-teste', 'info'),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'estoque_itens', plugin: estoqueItensRoutes }],
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojas) {
      await poolSuper.query('delete from public.movimentos_item_estoque where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.itens where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.categorias where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  it('item sem controle nao aparece na lista; lista comeca vazia', async () => {
    const r = await chamar(donoA, lojaA, 'GET', '/')
    expect(r.statusCode).toBe(200)
    expect(r.json().itens).toHaveLength(0)
  })

  it('PATCH controle liga com contagem e grava um ajuste; GET lista o item', async () => {
    const r = await chamar(donoA, lojaA, 'PATCH', `/${itemA}/controle`, {
      controla_estoque: true, quantidade_disponivel: 10,
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ controla_estoque: true, quantidade_disponivel: 10 })
    const lista = (await chamar(donoA, lojaA, 'GET', '/')).json().itens
    expect(lista.map((i: { id: string }) => i.id)).toEqual([itemA])
    const hist = (await chamar(donoA, lojaA, 'GET', `/${itemA}/movimentos`)).json().itens
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ tipo: 'ajuste', quantidade_resultante: 10 })
  })

  it('entrada soma, saida subtrai; saida alem do disponivel = 422 estoque_insuficiente', async () => {
    expect((await chamar(donoA, lojaA, 'POST', `/${itemA}/movimentos`, { tipo: 'entrada', quantidade: 5 })).json())
      .toMatchObject({ tipo: 'entrada', quantidade_resultante: 15 })
    const demais = await chamar(donoA, lojaA, 'POST', `/${itemA}/movimentos`, { tipo: 'saida', quantidade: 999 })
    expect(demais.statusCode).toBe(422)
    expect(demais.json().error.code).toBe('estoque_insuficiente')
    expect((await chamar(donoA, lojaA, 'POST', `/${itemA}/movimentos`, { tipo: 'saida', quantidade: 5 })).json())
      .toMatchObject({ quantidade_resultante: 10 })
  })

  it('ajuste fixa a contagem (pode zerar); entrada/saida com quantidade 0 = 400', async () => {
    expect((await chamar(donoA, lojaA, 'POST', `/${itemA}/movimentos`, { tipo: 'ajuste', quantidade: 0 })).json())
      .toMatchObject({ tipo: 'ajuste', quantidade_resultante: 0 })
    expect((await chamar(donoA, lojaA, 'POST', `/${itemA}/movimentos`, { tipo: 'entrada', quantidade: 0 })).statusCode)
      .toBe(400)
  })

  it('estoque baixo: somente_baixos corta pelo limiar', async () => {
    await chamar(donoA, lojaA, 'POST', `/${itemA}/movimentos`, { tipo: 'ajuste', quantidade: 2 })
    expect((await chamar(donoA, lojaA, 'GET', '/?somente_baixos=true&limiar=5')).json().itens).toHaveLength(1)
    expect((await chamar(donoA, lojaA, 'GET', '/?somente_baixos=true&limiar=1')).json().itens).toHaveLength(0)
  })

  it('item ilimitado (controle ligado, contagem NULL): entrada/saida 422, ajuste fixa', async () => {
    const outro = await novoItem(lojaA, 'Refri')
    await chamar(donoA, lojaA, 'PATCH', `/${outro}/controle`, { controla_estoque: true, quantidade_disponivel: null })
    expect((await chamar(donoA, lojaA, 'GET', `/${outro}`)).json().quantidade_disponivel).toBeNull()
    const saida = await chamar(donoA, lojaA, 'POST', `/${outro}/movimentos`, { tipo: 'saida', quantidade: 1 })
    expect(saida.statusCode).toBe(422)
    expect(saida.json().error.code).toBe('estoque_ilimitado')
    expect((await chamar(donoA, lojaA, 'POST', `/${outro}/movimentos`, { tipo: 'ajuste', quantidade: 7 })).json())
      .toMatchObject({ quantidade_resultante: 7 })
  })

  it('lancar em item sem controle = 422 estoque_sem_controle; desligar zera a contagem', async () => {
    const semCtrl = await novoItem(lojaA, 'Agua')
    const r = await chamar(donoA, lojaA, 'POST', `/${semCtrl}/movimentos`, { tipo: 'entrada', quantidade: 3 })
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('estoque_sem_controle')
    const off = await chamar(donoA, lojaA, 'PATCH', `/${itemA}/controle`, { controla_estoque: false })
    expect(off.json()).toMatchObject({ controla_estoque: false, quantidade_disponivel: null })
  })

  it('decrementarPorVenda: idempotente por pedido+item e nunca deixa negativo', async () => {
    const item = await novoItem(lojaA, 'Esfiha')
    await chamar(donoA, lojaA, 'PATCH', `/${item}/controle`, { controla_estoque: true, quantidade_disponivel: 3 })
    const ped = await poolSuper.query<{ id: string }>(
      `insert into public.pedidos (loja_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1, $2, 'novo', 0, 0) returning id`,
      [lojaA, 'E1'],
    )
    const pedidoId = ped.rows[0]!.id
    const r1 = await comTransacao(poolApi, (c) =>
      decrementarPorVenda(c, { item_id: item, loja_id: lojaA, quantidade: 5, pedido_id: pedidoId }))
    expect(r1).toMatchObject({ aplicado: true, quantidade_resultante: 0 }) // clamp a zero, nao negativo
    const r2 = await comTransacao(poolApi, (c) =>
      decrementarPorVenda(c, { item_id: item, loja_id: lojaA, quantidade: 1, pedido_id: pedidoId }))
    expect(r2).toMatchObject({ aplicado: false, motivo: 'ja_processado' })
    expect((await chamar(donoA, lojaA, 'GET', `/${item}`)).json().quantidade_disponivel).toBe(0)
    await poolSuper.query('delete from public.pedidos where id = $1', [pedidoId]).catch(() => {})
  })

  it('SEC-001/002: loja B nao enxerga nem mexe no item da loja A (404)', async () => {
    const outraItem = await novoItem(lojaB, 'Pao')
    await chamar(donoB, lojaB, 'PATCH', `/${outraItem}/controle`, { controla_estoque: true, quantidade_disponivel: 1 })
    expect((await chamar(donoB, lojaB, 'GET', `/${itemA}`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'PATCH', `/${itemA}/controle`, { controla_estoque: true })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', `/${itemA}/movimentos`, { tipo: 'entrada', quantidade: 1 })).statusCode).toBe(404)
    const lista = (await chamar(donoB, lojaB, 'GET', '/')).json().itens
    expect(lista.map((i: { id: string }) => i.id)).toEqual([outraItem])
    // loja_id no corpo e ignorado (schema estrito): 400
    expect((await chamar(donoA, lojaA, 'PATCH', `/${itemA}/controle`, { controla_estoque: true, loja_id: lojaB })).statusCode).toBe(400)
  })

  it('sem autenticacao: 401; id malformado: 400; inexistente: 404', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/estoque_itens' })).statusCode).toBe(401)
    expect((await chamar(donoA, lojaA, 'GET', '/nao-e-uuid')).statusCode).toBe(400)
    expect((await chamar(donoA, lojaA, 'GET', `/${randomUUID()}`)).statusCode).toBe(404)
  })
})
