// Integracao + seguranca dos relatorios (papel, isolamento por loja, fuso SP) no Postgres local.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar, novoCenario, poolApi,
  poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarRelatoriosRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[relatorios] banco inacessivel: integracao PULADA.')

d('modulo relatorios', () => {
  const cen = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let donoA: string, atendenteA: string, donoB: string, lojaA: string, lojaB: string
  let seq = 0

  const chamar = (user: string, loja: string | null, url: string) =>
    app.inject({
      method: 'GET',
      url: `/v1/relatorios${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
    })

  async function pedido(
    loja: string,
    o: { status: string; total: number; criado: string; origem?: string; cliente?: string; motivo?: string },
  ): Promise<string> {
    const id = randomUUID()
    await poolSuper.query(
      `insert into public.pedidos (id, loja_id, codigo, status, origem, subtotal_centavos, total_centavos,
         criado_em, cliente_id, problema_motivo)
       values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)`,
      [id, loja, `R${++seq}`, o.status, o.origem ?? 'whatsapp', o.total, o.criado, o.cliente ?? null,
       o.status === 'problema' ? (o.motivo ?? 'teste') : null],
    )
    return id
  }
  const item = (pedidoId: string, loja: string, nome: string, qtd: number, total: number, itemId: string | null = null) =>
    poolSuper.query(
      `insert into public.itens_pedido (pedido_id, loja_id, item_id, nome_snapshot, preco_unitario_centavos, quantidade, total_centavos)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [pedidoId, loja, itemId, nome, Math.round(total / qtd), qtd, total],
    )
  const cliente = async (loja: string) =>
    (await poolSuper.query(
      `insert into public.clientes (loja_id, telefone_hash) values ($1, $2) returning id`,
      [loja, randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')])).rows[0].id as string

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    atendenteA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaA, atendenteA, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)

    // Cardapio da loja A: categoria "Lanches" com o item "Burger".
    const cat = (await poolSuper.query(
      `insert into public.categorias (loja_id, nome) values ($1, 'Lanches') returning id`, [lojaA])).rows[0].id as string
    const burger = (await poolSuper.query(
      `insert into public.itens (loja_id, categoria_id, nome, preco_centavos) values ($1, $2, 'Burger', 2000) returning id`,
      [lojaA, cat])).rows[0].id as string

    const c1 = await cliente(lojaA)
    const c2 = await cliente(lojaA)
    // Loja A. 23:59 de 09/03 (02:59Z) cai no dia 09 em SP; 15:00Z = 12h SP do dia 10 (terca).
    const p1 = await pedido(lojaA, { status: 'entregue', total: 5000, criado: '2026-03-10T02:59:00Z', cliente: c1 })
    const p2 = await pedido(lojaA, { status: 'entregue', total: 3000, criado: '2026-03-10T15:00:00Z', origem: 'ifood', cliente: c1 })
    const p3 = await pedido(lojaA, { status: 'entregue', total: 2000, criado: '2026-04-05T15:00:00Z', cliente: c2 })
    await pedido(lojaA, { status: 'novo', total: 1000, criado: '2026-03-10T15:00:00Z' })
    await pedido(lojaA, { status: 'problema', total: 700, criado: '2026-03-10T16:00:00Z', motivo: ' Sem Entregador ' })
    await pedido(lojaA, { status: 'problema', total: 300, criado: '2026-03-11T16:00:00Z', motivo: 'sem entregador' })
    const rascunho = await pedido(lojaA, { status: 'rascunho', total: 9999, criado: '2026-03-10T17:00:00Z' })
    await item(p1, lojaA, 'Burger', 2, 4000, burger)
    await item(p1, lojaA, 'Suco', 1, 1000) // sem item_id: "Sem categoria"
    await item(p2, lojaA, 'Burger', 1, 2000, burger)
    await item(p2, lojaA, 'Suco', 1, 1000)
    await item(p3, lojaA, 'Burger', 1, 2000, burger)
    await item(rascunho, lojaA, 'Burger', 9, 9999, burger)

    // Pagamentos: caixa (dinheiro 3000 do p2) + Pix online de p1 (pago) + p2 tambem com Pix pago (nao conta: ja no caixa).
    const caixa = (await poolSuper.query(
      `insert into public.caixas (loja_id, aberto_por_user_id, aberto_em) values ($1, $2, '2026-03-10T10:00:00Z') returning id`,
      [lojaA, donoA])).rows[0].id as string
    await poolSuper.query(
      `insert into public.movimentos_caixa (loja_id, caixa_id, tipo, forma_pagamento, valor_centavos, pedido_id, criado_por_user_id, criado_em)
       values ($1, $2, 'venda', 'dinheiro', 3000, $3, $4, '2026-03-10T15:10:00Z')`,
      [lojaA, caixa, p2, donoA])
    await poolSuper.query(
      `insert into public.pagamentos (loja_id, pedido_id, status, valor_centavos, pago_em, criado_em)
       values ($1, $2, 'pago', 5000, '2026-03-10T03:30:00Z', '2026-03-10T03:00:00Z')`, [lojaA, p1])
    await poolSuper.query(
      `insert into public.pagamentos (loja_id, pedido_id, status, valor_centavos, pago_em, criado_em)
       values ($1, $2, 'pago', 3000, '2026-03-10T15:20:00Z', '2026-03-10T15:05:00Z')`, [lojaA, p2])

    // Loja B: dado que A nunca pode ver.
    const pb = await pedido(lojaB, { status: 'entregue', total: 777777, criado: '2026-03-10T15:00:00Z' })
    await item(pb, lojaB, 'Segredo B', 5, 777777)

    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('relatorios-teste', 'error'),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'relatorios', plugin: criarRelatoriosRoutes() }],
    })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    for (const l of [lojaA, lojaB]) {
      await poolSuper.query('delete from public.pagamentos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.movimentos_caixa where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.caixas where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.pedidos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.clientes where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.itens where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.categorias where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  const Q = 'de=2026-03-01&ate=2026-04-30'

  it('vendas por dia: fuso SP (23:59 de 09/03 fica no dia 09), so entregues, centavos', async () => {
    const r = await chamar(donoA, lojaA, `/vendas?agrupar_por=dia&${Q}`)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.linhas.map((l: { chave: string }) => l.chave)).toEqual(['2026-03-09', '2026-03-10', '2026-04-05'])
    expect(j.linhas[0]).toMatchObject({ pedidos: 1, faturamento_centavos: 5000, ticket_medio_centavos: 5000 })
    expect(j.total_pedidos).toBe(3)
    expect(j.total_faturamento_centavos).toBe(10000)
    expect(JSON.stringify(j)).not.toContain('Segredo B')
  })

  it('vendas por mes, origem, hora e dia da semana', async () => {
    const mes = (await chamar(donoA, lojaA, `/vendas?agrupar_por=mes&${Q}`)).json()
    expect(mes.linhas.map((l: { chave: string; faturamento_centavos: number }) => [l.chave, l.faturamento_centavos]))
      .toEqual([['2026-03', 8000], ['2026-04', 2000]])
    const origem = (await chamar(donoA, lojaA, `/vendas?agrupar_por=origem&${Q}`)).json()
    expect(origem.linhas[0]).toMatchObject({ chave: 'whatsapp', pedidos: 2, faturamento_centavos: 7000 })
    expect(origem.linhas[0].participacao).toBeCloseTo(0.7)
    const hora = (await chamar(donoA, lojaA, `/vendas?agrupar_por=hora&${Q}`)).json()
    expect(hora.linhas.map((l: { chave: string }) => l.chave)).toEqual(['12', '23'])
    expect(hora.linhas[1].rotulo).toBe('23h')
    const dow = (await chamar(donoA, lojaA, `/vendas?agrupar_por=dia_semana&${Q}`)).json()
    expect(dow.linhas.some((l: { rotulo: string }) => l.rotulo === 'Terca')).toBe(true)
  })

  it('vendas por item e categoria: cancelado/rascunho fora, sem categoria agrupada', async () => {
    const it = (await chamar(donoA, lojaA, `/vendas?agrupar_por=item&${Q}`)).json()
    expect(it.linhas[0]).toMatchObject({ chave: 'Burger', quantidade: 4, pedidos: 3, faturamento_centavos: 8000, ticket_medio_centavos: null })
    const cat = (await chamar(donoA, lojaA, `/vendas?agrupar_por=categoria&${Q}`)).json()
    expect(cat.linhas.map((l: { chave: string; faturamento_centavos: number }) => [l.chave, l.faturamento_centavos]))
      .toEqual([['Lanches', 8000], ['Sem categoria', 2000]])
    const top1 = (await chamar(donoA, lojaA, `/vendas?agrupar_por=item&limite=1&${Q}`)).json()
    expect(top1.linhas).toHaveLength(1)
  })

  it('formas de pagamento: caixa + Pix online sem dupla contagem', async () => {
    const j = (await chamar(donoA, lojaA, `/formas-pagamento?${Q}`)).json()
    expect(j.linhas.map((l: { forma: string; valor_centavos: number; transacoes: number }) => [l.forma, l.valor_centavos, l.transacoes]))
      .toEqual([['pix', 5000, 1], ['dinheiro', 3000, 1]])
    expect(j.total_centavos).toBe(8000)
  })

  it('cancelamentos: motivos normalizados, taxa e valor perdido', async () => {
    const j = (await chamar(donoA, lojaA, `/cancelamentos?${Q}`)).json()
    expect(j.total_problemas).toBe(2)
    expect(j.total_pedidos).toBe(6) // sem o rascunho
    expect(j.taxa_problema).toBeCloseTo(2 / 6)
    expect(j.valor_perdido_centavos).toBe(1000)
    expect(j.motivos).toEqual([{ motivo: 'sem entregador', pedidos: 2, valor_centavos: 1000 }])
  })

  it('coortes: estreia por mes SP e retencao por offset, sem expor cliente', async () => {
    const j = (await chamar(donoA, lojaA, `/coortes?${Q}`)).json()
    const marco = j.coortes.find((c: { mes: string }) => c.mes === '2026-03')
    const abril = j.coortes.find((c: { mes: string }) => c.mes === '2026-04')
    expect(marco.clientes).toBe(1)
    expect(marco.retencao[0]).toEqual({ offset: 0, clientes: 1, taxa: 1 })
    expect(abril.clientes).toBe(1)
    expect(JSON.stringify(j)).not.toMatch(/telefone|cliente_id/)
  })

  it('isolamento: loja B ve so o seu; atendente sem relatorios:ver recebe 403', async () => {
    const b = (await chamar(donoB, lojaB, `/vendas?agrupar_por=item&${Q}`)).json()
    expect(b.linhas.map((l: { chave: string }) => l.chave)).toEqual(['Segredo B'])
    // dono de B tentando ler a loja A pelo header: escopo recusa.
    const cruzado = await chamar(donoB, lojaA, `/vendas?agrupar_por=dia&${Q}`)
    expect(cruzado.statusCode).toBeGreaterThanOrEqual(403)
    const at = await chamar(atendenteA, lojaA, `/vendas?agrupar_por=dia&${Q}`)
    expect(at.statusCode).toBe(403)
    expect(at.json().error.code).toBeTruthy()
  })

  it('validacao: dimensao invalida, periodo invertido e sem loja', async () => {
    expect((await chamar(donoA, lojaA, `/vendas?agrupar_por=cliente&${Q}`)).statusCode).toBe(400)
    expect((await chamar(donoA, lojaA, `/vendas`)).statusCode).toBe(400)
    const inv = await chamar(donoA, lojaA, '/cancelamentos?de=2026-04-30&ate=2026-03-01')
    expect(inv.statusCode).toBe(400)
    expect(inv.json().error.code).toBe('periodo_invalido')
    expect((await chamar(donoA, null, `/coortes?${Q}`)).statusCode).toBeGreaterThanOrEqual(400)
  })
})
