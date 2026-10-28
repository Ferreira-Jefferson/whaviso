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
  let grpTamId: string
  let seq = 0

  const chamar = (user: string, loja: string | null, url: string) =>
    app.inject({
      method: 'GET',
      url: `/v1/relatorios${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
    })

  const auth = (user: string, loja: string | null) =>
    ({ authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) })

  // Montador flexivel e POST (carrega o array de filtros no corpo).
  const vendas = (user: string, loja: string | null, body: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/v1/relatorios/vendas', headers: auth(user, loja), payload: body })

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

    // Entregador: o p3 sai com o motoboy; p1 e p2 ficam no balde "Sem motoboy".
    const motoboy = (await poolSuper.query(
      `insert into public.motoboys (loja_id, nome) values ($1, 'Ze Entregas') returning id`, [lojaA])).rows[0].id as string
    await poolSuper.query('update public.pedidos set motoboy_id = $1 where id = $2', [motoboy, p3])

    // Grupo de opcao 'Tamanho' com a opcao 'Grande' escolhida no Burger do p1 (2 unidades, 4000).
    grpTamId = (await poolSuper.query(
      `insert into public.grupos_opcoes (loja_id, nome, tipo) values ($1, 'Tamanho', 'tamanho') returning id`, [lojaA])).rows[0].id as string
    const opGrande = (await poolSuper.query(
      `insert into public.opcoes (loja_id, grupo_id, nome) values ($1, $2, 'Grande') returning id`, [lojaA, grpTamId])).rows[0].id as string
    const ipBurger = (await poolSuper.query(
      `select id from public.itens_pedido where pedido_id = $1 and nome_snapshot = 'Burger'`, [p1])).rows[0].id as string
    await poolSuper.query(
      `insert into public.itens_pedido_opcoes (item_pedido_id, loja_id, opcao_id, grupo_nome_snapshot, nome_snapshot)
       values ($1, $2, $3, 'Tamanho', 'Grande')`, [ipBurger, lojaA, opGrande])

    // Mesa: comanda FECHADA no periodo (fonte salao, fora de pedidos); abre e fecha em 10/03.
    const mesa = (await poolSuper.query(
      `insert into public.mesas (loja_id, nome) values ($1, 'Mesa 1') returning id`, [lojaA])).rows[0].id as string
    await poolSuper.query(
      `insert into public.comandas (loja_id, mesa_id, status, aberta_por_user_id, aberta_em, fechada_em, total_centavos)
       values ($1, $2, 'fechada', $3, '2026-03-10T18:00:00Z', '2026-03-10T20:00:00Z', 4500)`, [lojaA, mesa, donoA])

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
      await poolSuper.query('delete from public.comandas where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.mesas where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.pedidos where loja_id = $1', [l]).catch(() => {}) // cascateia itens_pedido(_opcoes)
      await poolSuper.query('delete from public.motoboys where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.opcoes where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.grupos_opcoes where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.clientes where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.itens where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.categorias where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  const PERIODO = { de: '2026-03-01', ate: '2026-04-30' }
  const Q = 'de=2026-03-01&ate=2026-04-30'
  const map3 = (j: { linhas: { rotulo: string; faturamento_centavos: number; pedidos: number }[] }) =>
    j.linhas.map((l) => [l.rotulo, l.faturamento_centavos, l.pedidos])

  it('agrupar por dia: grao de item, fuso SP (23:59 de 09/03 no dia 09), so entregues', async () => {
    const r = await vendas(donoA, lojaA, { ...PERIODO, agrupar_por: 'dia' })
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.linhas.map((l: { chave: string }) => l.chave)).toEqual(['2026-03-09', '2026-03-10', '2026-04-05'])
    expect(j.linhas[0]).toMatchObject({ pedidos: 1, faturamento_centavos: 5000, ticket_medio_centavos: 5000 })
    expect(j.total_pedidos).toBe(3)
    expect(j.total_faturamento_centavos).toBe(10000)
    expect(JSON.stringify(j)).not.toContain('Segredo B')
  })

  it('agrupar por item e categoria: grao de item, cancelado/rascunho fora, com ticket', async () => {
    const it = (await vendas(donoA, lojaA, { ...PERIODO, agrupar_por: 'item' })).json()
    expect(it.linhas[0]).toMatchObject({ chave: 'Burger', quantidade: 4, pedidos: 3, faturamento_centavos: 8000, ticket_medio_centavos: 2667 })
    const cat = (await vendas(donoA, lojaA, { ...PERIODO, agrupar_por: 'categoria' })).json()
    expect(cat.linhas.map((l: { chave: string; faturamento_centavos: number }) => [l.chave, l.faturamento_centavos]))
      .toEqual([['Lanches', 8000], ['Sem categoria', 2000]])
    const top1 = (await vendas(donoA, lojaA, { ...PERIODO, agrupar_por: 'item', limite: 1 })).json()
    expect(top1.linhas).toHaveLength(1)
  })

  it('agrupar por motoboy: entregador e balde "Sem motoboy"', async () => {
    const j = (await vendas(donoA, lojaA, { ...PERIODO, agrupar_por: 'motoboy' })).json()
    expect(map3(j)).toEqual([['Sem motoboy', 8000, 2], ['Ze Entregas', 2000, 1]])
    expect(j.linhas[1].ticket_medio_centavos).toBe(2000)
    expect(j.total_faturamento_centavos).toBe(10000)
  })

  it('agrupar por grupo de opcao dinamico (opcao:<grupo>): Grande x sem opcao', async () => {
    const j = (await vendas(donoA, lojaA, { ...PERIODO, agrupar_por: `opcao:${grpTamId}` })).json()
    expect(map3(j)).toEqual([['(sem opção)', 6000, 3], ['Grande', 4000, 1]])
    const grande = j.linhas.find((l: { rotulo: string }) => l.rotulo === 'Grande')
    expect(grande).toMatchObject({ quantidade: 2, pedidos: 1 })
  })

  it('filtro de opcao: agrupar por item mantendo so quem tem Tamanho=Grande', async () => {
    const j = (await vendas(donoA, lojaA, {
      ...PERIODO, agrupar_por: 'item', filtros: [{ dimensao: `opcao:${grpTamId}`, valores: ['Grande'] }],
    })).json()
    expect(j.linhas).toHaveLength(1)
    expect(j.linhas[0]).toMatchObject({ chave: 'Burger', quantidade: 2, pedidos: 1, faturamento_centavos: 4000 })
    expect(j.total_pedidos).toBe(1)
    expect(j.total_faturamento_centavos).toBe(4000)
  })

  it('filtros combinados (E): sem motoboy E categoria Lanches deixa so o Burger', async () => {
    const j = (await vendas(donoA, lojaA, {
      ...PERIODO, agrupar_por: 'item',
      filtros: [{ dimensao: 'motoboy', valores: ['sem'] }, { dimensao: 'categoria', valores: ['Lanches'] }],
    })).json()
    expect(j.linhas.map((l: { chave: string }) => l.chave)).toEqual(['Burger'])
    expect(j.linhas[0]).toMatchObject({ faturamento_centavos: 6000, quantidade: 3, pedidos: 2 })
  })

  it('dimensoes disponiveis: fixas + grupo de opcao do cardapio, com valores de filtro', async () => {
    const j = (await chamar(donoA, lojaA, '/dimensoes')).json()
    const chaves = j.dimensoes.map((d: { chave: string }) => d.chave)
    expect(chaves).toContain('item')
    expect(chaves).toContain(`opcao:${grpTamId}`)
    const tam = j.dimensoes.find((d: { chave: string }) => d.chave === `opcao:${grpTamId}`)
    expect(tam).toMatchObject({ rotulo: 'Tamanho', grupo: 'opcao', filtravel: true })
    expect(tam.valores.map((v: { chave: string }) => v.chave)).toContain('Grande')
    const mb = j.dimensoes.find((d: { chave: string }) => d.chave === 'motoboy')
    expect(mb.valores.some((v: { rotulo: string }) => v.rotulo === 'Ze Entregas')).toBe(true)
    expect(mb.valores.some((v: { chave: string }) => v.chave === 'sem')).toBe(true)
  })

  it('salao: comandas fechadas por mesa, universo proprio (nao pedidos)', async () => {
    const j = (await chamar(donoA, lojaA, `/salao?${'de=2026-03-01&ate=2026-04-30'}`)).json()
    expect(map3(j)).toEqual([['Mesa 1', 4500, 1]])
    expect(j.linhas[0]).toMatchObject({ quantidade: 0, ticket_medio_centavos: 4500 })
    expect(j.total_pedidos).toBe(1)
    expect(j.total_faturamento_centavos).toBe(4500)
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
    const b = (await vendas(donoB, lojaB, { ...PERIODO, agrupar_por: 'item' })).json()
    expect(b.linhas.map((l: { chave: string }) => l.chave)).toEqual(['Segredo B'])
    // dono de B tentando ler a loja A pelo header: escopo recusa.
    const cruzado = await vendas(donoB, lojaA, { ...PERIODO, agrupar_por: 'dia' })
    expect(cruzado.statusCode).toBeGreaterThanOrEqual(403)
    const at = await vendas(atendenteA, lojaA, { ...PERIODO, agrupar_por: 'dia' })
    expect(at.statusCode).toBe(403)
    expect(at.json().error.code).toBeTruthy()
    const atDim = await chamar(atendenteA, lojaA, '/dimensoes')
    expect(atDim.statusCode).toBe(403)
  })

  it('validacao: dimensao desconhecida, filtro mal formado e periodo invertido', async () => {
    expect((await vendas(donoA, lojaA, { ...PERIODO, agrupar_por: 'cliente' })).statusCode).toBe(400)
    expect((await vendas(donoA, lojaA, { ...PERIODO, agrupar_por: 'opcao:nao-e-uuid' })).statusCode).toBe(400)
    expect((await vendas(donoA, lojaA, {})).statusCode).toBe(400)
    expect((await vendas(donoA, lojaA, {
      ...PERIODO, agrupar_por: 'item', filtros: [{ dimensao: 'motoboy', valores: [] }],
    })).statusCode).toBe(400)
    const inv = await vendas(donoA, lojaA, { de: '2026-04-30', ate: '2026-03-01', agrupar_por: 'dia' })
    expect(inv.statusCode).toBe(400)
    expect(inv.json().error.code).toBe('periodo_invalido')
  })
})
