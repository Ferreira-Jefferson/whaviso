// Integracao + seguranca do dashboard (SEC-001/002/003/080, papel, fuso) no Postgres local.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarDashboardRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[dashboard] banco inacessivel: integracao PULADA.')

d('modulo dashboard', () => {
  const cen = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let donoA: string, atendenteA: string, donoB: string, operador: string, lojaA: string, lojaB: string
  let seq = 0

  const chamar = (user: string, loja: string | null, url: string) =>
    app.inject({
      method: 'GET',
      url: `/v1/dashboard${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
    })

  async function pedido(
    loja: string,
    o: { status: string; total: number; criado: string; entregue?: string; origem?: string; conversa?: string },
  ): Promise<string> {
    const id = randomUUID()
    await poolSuper.query(
      `insert into public.pedidos (id, loja_id, codigo, status, origem, subtotal_centavos, total_centavos,
         criado_em, entregue_em, conversa_id, problema_motivo)
       values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10)`,
      [id, loja, `D${++seq}`, o.status, o.origem ?? 'whatsapp', o.total, o.criado, o.entregue ?? null, o.conversa ?? null,
       o.status === 'problema' ? 'teste' : null],
    )
    return id
  }
  const item = (pedidoId: string, loja: string, nome: string, qtd: number, total: number, cancelado = false) =>
    poolSuper.query(
      `insert into public.itens_pedido (pedido_id, loja_id, nome_snapshot, preco_unitario_centavos, quantidade, total_centavos, cancelado)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [pedidoId, loja, nome, Math.round(total / qtd), qtd, total, cancelado],
    )

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    atendenteA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    operador = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaA, atendenteA, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    await criarOperador(operador)

    // Loja A, dia 2026-03-10 (SP). 23:59 de 09/03 (02:59Z) e 00:01 de 10/03 (03:01Z).
    const p1 = await pedido(lojaA, { status: 'entregue', total: 5000, criado: '2026-03-10T02:59:00Z', entregue: '2026-03-10T03:29:00Z' })
    const p2 = await pedido(lojaA, { status: 'entregue', total: 3001, criado: '2026-03-10T03:01:00Z', entregue: '2026-03-10T03:21:00Z' })
    const p3 = await pedido(lojaA, { status: 'novo', total: 1000, criado: '2026-03-10T15:00:00Z', origem: 'ifood' })
    await pedido(lojaA, { status: 'problema', total: 700, criado: '2026-03-10T16:00:00Z' })
    const rascunho = await pedido(lojaA, { status: 'rascunho', total: 9999, criado: '2026-03-10T17:00:00Z' })
    await item(p1, lojaA, 'Burger', 2, 4000)
    await item(p1, lojaA, 'Suco', 1, 1000)
    await item(p2, lojaA, 'Burger', 1, 2000)
    await item(p2, lojaA, 'Suco', 1, 1001, true) // linha cancelada nao conta
    await item(p3, lojaA, 'Pizza', 1, 1000)
    await item(rascunho, lojaA, 'Burger', 9, 9999) // rascunho nao conta

    // Loja B: dado que A nunca pode ver.
    const pb = await pedido(lojaB, { status: 'entregue', total: 777777, criado: '2026-03-10T15:00:00Z', entregue: '2026-03-10T16:00:00Z' })
    await item(pb, lojaB, 'Segredo B', 5, 777777)

    // Conversas (loja A): uma 100% IA e uma com humano; pedidos ligados a elas.
    const num = (await poolSuper.query(
      `insert into public.numeros_whatsapp (loja_id, phone_number_id, waba_id) values ($1, $2, 'w') returning id`,
      [lojaA, `pn-${randomUUID()}`])).rows[0].id as string
    const cli = async () => (await poolSuper.query(
      `insert into public.clientes (loja_id, telefone_hash) values ($1, $2) returning id`,
      [lojaA, randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')])).rows[0].id as string
    const cIa = (await poolSuper.query(
      `insert into public.conversas (loja_id, numero_whatsapp_id, cliente_id, status, criado_em) values ($1,$2,$3,'ia','2026-03-10T15:00:00Z') returning id`,
      [lojaA, num, await cli()])).rows[0].id as string
    const cHum = (await poolSuper.query(
      `insert into public.conversas (loja_id, numero_whatsapp_id, cliente_id, status, humano_desde, criado_em)
       values ($1,$2,$3,'humano','2026-03-10T16:00:00Z','2026-03-10T15:30:00Z') returning id`,
      [lojaA, num, await cli()])).rows[0].id as string
    await poolSuper.query('update public.pedidos set conversa_id = $1 where id = $2', [cIa, p3])
    await poolSuper.query('update public.pedidos set conversa_id = $1 where id = $2', [cHum, p2])

    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('dashboard-teste', 'error'),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'dashboard', plugin: criarDashboardRoutes() }],
    })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    for (const l of [lojaA, lojaB]) {
      await poolSuper.query('delete from public.pedidos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.conversas where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.clientes where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.numeros_whatsapp where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  const Q = '?de=2026-03-10&ate=2026-03-10'

  it('resumo: contagens, faturamento em centavos, ticket e tempo medio; rascunho fora; fuso SP', async () => {
    const r = await chamar(donoA, lojaA, `/resumo${Q}`)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    // p1 (23:59 de 09/03 em SP) fica FORA do dia 10; p2, p3 e problema ficam dentro.
    expect(j.total_pedidos).toBe(3)
    expect(j.por_status).toEqual({ novo: 1, em_preparo: 0, saiu_entrega: 0, entregue: 1, problema: 1 })
    expect(j.por_origem).toEqual({ whatsapp: 2, ifood: 1, manual: 0 })
    expect(j.faturamento_realizado_centavos).toBe(3001)
    expect(j.faturamento_em_andamento_centavos).toBe(1000)
    expect(j.ticket_medio_centavos).toBe(3001)
    expect(j.tempo_medio_entrega_minutos).toBe(20)
  })

  it('resumo do dia anterior pega o pedido das 23:59', async () => {
    const j = (await chamar(donoA, lojaA, '/resumo?de=2026-03-09&ate=2026-03-09')).json()
    expect(j.total_pedidos).toBe(1)
    expect(j.faturamento_realizado_centavos).toBe(5000)
  })

  it('periodo vazio devolve zeros e null (nao erro)', async () => {
    const r = await chamar(donoA, lojaA, '/resumo?de=2020-01-01&ate=2020-01-01')
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.total_pedidos).toBe(0)
    expect(j.faturamento_realizado_centavos).toBe(0)
    expect(j.ticket_medio_centavos).toBeNull()
    expect(j.tempo_medio_entrega_minutos).toBeNull()
  })

  it('serie diaria preenche dias sem pedido com zero e respeita a virada de dia', async () => {
    const j = (await chamar(donoA, lojaA, '/serie-diaria?de=2026-03-09&ate=2026-03-11')).json()
    expect(j.dias.map((x: { data: string }) => x.data)).toEqual(['2026-03-09', '2026-03-10', '2026-03-11'])
    expect(j.dias.map((x: { pedidos: number }) => x.pedidos)).toEqual([1, 3, 0])
    expect(j.dias[0].faturamento_centavos).toBe(5000)
    expect(j.dias[2].faturamento_centavos).toBe(0)
  })

  it('por hora: 24 faixas no relogio de SP', async () => {
    const j = (await chamar(donoA, lojaA, `/por-hora${Q}`)).json()
    expect(j.horas).toHaveLength(24)
    const h = (n: number) => j.horas[n].pedidos
    expect([h(0), h(12), h(13)]).toEqual([1, 1, 1]) // 00:01, 12:00 (novo) e 13:00 (problema) em SP
    expect(j.horas[0].faturamento_centavos).toBe(3001)
  })

  it('top itens: so pedidos validos e linhas nao canceladas, limite respeitado', async () => {
    const j = (await chamar(donoA, lojaA, '/top-itens?de=2026-03-09&ate=2026-03-10')).json()
    expect(j.itens).toEqual([
      { nome: 'Burger', quantidade: 3, receita_centavos: 6000 },
      { nome: 'Pizza', quantidade: 1, receita_centavos: 1000 },
      { nome: 'Suco', quantidade: 1, receita_centavos: 1000 },
    ])
    const um = (await chamar(donoA, lojaA, '/top-itens?de=2026-03-09&ate=2026-03-10&limite=1')).json()
    expect(um.itens).toHaveLength(1)
  })

  it('atendimento: conversas e taxa de autonomia', async () => {
    const j = (await chamar(donoA, lojaA, `/atendimento${Q}`)).json()
    expect(j.conversas_abertas).toBe(2)
    expect(j.conversas_em_humano).toBe(1)
    expect(j.conversas_no_periodo).toEqual({ ia: 1, humano: 1, encerrada: 0 })
    expect(j.pedidos_com_conversa).toBe(2)
    expect(j.pedidos_sem_intervencao_humana).toBe(1)
    expect(j.taxa_autonomia_ia).toBe(0.5)
  })

  it('geral: agrega os cinco read-models numa chamada, igual as rotas individuais', async () => {
    const g = await chamar(donoA, lojaA, `/geral${Q}`)
    expect(g.statusCode).toBe(200)
    const j = g.json()
    expect(j.resumo).toEqual((await chamar(donoA, lojaA, `/resumo${Q}`)).json())
    expect(j.serie_diaria).toEqual((await chamar(donoA, lojaA, `/serie-diaria${Q}`)).json())
    expect(j.por_hora).toEqual((await chamar(donoA, lojaA, `/por-hora${Q}`)).json())
    expect(j.top_itens).toEqual((await chamar(donoA, lojaA, `/top-itens${Q}`)).json())
    expect(j.atendimento).toEqual((await chamar(donoA, lojaA, `/atendimento${Q}`)).json())
    // atendente nao ve financeiro tambem no agregado
    const atend = (await chamar(atendenteA, lojaA, `/geral${Q}`)).json()
    expect(atend.resumo.faturamento_realizado_centavos).toBeNull()
    // operador da plataforma: 403 (conteudo de loja)
    expect((await chamar(operador, lojaA, `/geral${Q}`)).statusCode).toBe(403)
  })

  it('SEC-001/002: loja B nunca ve numeros da A, e vice-versa; loja forjada no header = 403/404', async () => {
    const b = (await chamar(donoB, lojaB, `/resumo${Q}`)).json()
    expect(b.total_pedidos).toBe(1)
    expect(b.faturamento_realizado_centavos).toBe(777777)
    const itensB = (await chamar(donoB, lojaB, '/top-itens?de=2026-03-09&ate=2026-03-10')).json()
    expect(itensB.itens.map((i: { nome: string }) => i.nome)).toEqual(['Segredo B'])
    const forjado = await chamar(donoB, lojaA, `/resumo${Q}`)
    expect([403, 404]).toContain(forjado.statusCode)
    expect(forjado.body).not.toContain('5000')
  })

  it('atendente ve contagens, mas faturamento/ticket/receita vem null', async () => {
    const r = (await chamar(atendenteA, lojaA, `/resumo${Q}`)).json()
    expect(r.total_pedidos).toBe(3)
    expect(r.faturamento_realizado_centavos).toBeNull()
    expect(r.faturamento_em_andamento_centavos).toBeNull()
    expect(r.ticket_medio_centavos).toBeNull()
    const t = (await chamar(atendenteA, lojaA, '/top-itens?de=2026-03-09&ate=2026-03-10')).json()
    expect(t.itens[0].quantidade).toBe(3)
    expect(t.itens[0].receita_centavos).toBeNull()
    const s = (await chamar(atendenteA, lojaA, '/serie-diaria?de=2026-03-10&ate=2026-03-10')).json()
    expect(s.dias[0].faturamento_centavos).toBeNull()
  })

  it('SEC-003: operador da plataforma recebe 403 (conteudo de loja)', async () => {
    expect((await chamar(operador, lojaA, `/resumo${Q}`)).statusCode).toBe(403)
  })

  it('sem loja ativa nem membro: negado; sem token: 401', async () => {
    expect((await chamar(donoA, null, `/resumo${Q}`)).statusCode).toBeGreaterThanOrEqual(400)
    const sem = await app.inject({ method: 'GET', url: `/v1/dashboard/resumo${Q}` })
    expect(sem.statusCode).toBe(401)
  })

  it('SEC-080: entrada invalida = 400/422 com envelope; mais de 366 dias = 400', async () => {
    for (const url of ['/resumo?de=10-03-2026', "/resumo?de=2026-03-10'; drop table pedidos;--", '/resumo?x=1', '/top-itens?limite=999']) {
      const r = await chamar(donoA, lojaA, url)
      expect([400, 422]).toContain(r.statusCode)
      expect(r.json().error.code).toBeTruthy()
    }
    const longo = await chamar(donoA, lojaA, '/resumo?de=2024-01-01&ate=2026-03-10')
    expect(longo.statusCode).toBe(400)
    expect(longo.json().error.code).toBe('periodo_invalido')
    const invertido = await chamar(donoA, lojaA, '/resumo?de=2026-03-11&ate=2026-03-10')
    expect(invertido.statusCode).toBe(400)
  })
})
