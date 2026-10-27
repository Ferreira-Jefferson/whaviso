// Integracao do despacho basico: atribuir motoboy, compor/reordenar/despachar/concluir/cancelar corrida,
// isolamento entre lojas e a garantia de que `pedidos.status` nunca muda. Roda no Postgres LOCAL
// whaviso_dev com a app real; se offline, pula.
import { randomUUID } from 'node:crypto'
import type { InjectOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar, novoCenario,
  poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarLogger } from '@whaviso/shared/logger'
import { despachoRoutes } from './routes'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[despacho] banco inacessivel: integracao PULADA.')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
type Resp = { status: number; corpo: any; body: string }

async function q<T = { id: string }>(sql: string, params: unknown[]): Promise<T> {
  return (await poolSuper.query(sql, params)).rows[0] as T
}

d('modulo despacho', () => {
  const cenario = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let dono = '', atendente = '', donoB = ''
  let lojaA = '', lojaB = ''
  let zonaA = '', motoboyA = '', motoboyInativo = '', motoboyB = ''

  async function motoboy(loja: string, nome: string, ativo = true): Promise<string> {
    const cargo = (await q("select id from public.cargos where chave = 'motoboy' and loja_id is null", [])).id
    const pessoa = (await q(
      'insert into public.pessoas (loja_id, nome, cargo_id) values ($1,$2,$3) returning id', [loja, nome, cargo],
    )).id
    return (await q(
      'insert into public.motoboys (loja_id, nome, pessoa_id, ativo) values ($1,$2,$3,$4) returning id',
      [loja, nome, pessoa, ativo],
    )).id
  }

  async function pedido(
    loja: string, o: { status?: string; modalidade?: string; zona?: string | null } = {},
  ): Promise<string> {
    return (await q(
      `insert into public.pedidos (loja_id, codigo, status, modalidade, subtotal_centavos, total_centavos, zona_id)
       values ($1,$2,$3::status_pedido,$4::modalidade_pedido,2000,2000,$5) returning id`,
      [loja, `D${randomUUID().slice(0, 8)}`, o.status ?? 'em_preparo', o.modalidade ?? 'entrega', o.zona ?? null],
    )).id
  }

  const estado = async (id: string) =>
    (await q<{ status: string; motoboy_id: string | null; motoboy_nome: string | null; corrida_id: string | null; ordem_parada: number | null }>(
      'select status, motoboy_id, motoboy_nome, corrida_id, ordem_parada from public.pedidos where id = $1', [id],
    ))

  async function chamar(
    user: string, loja: string, metodo: NonNullable<InjectOptions['method']>, url: string, corpo?: unknown,
  ): Promise<Resp> {
    const res = await app.inject({
      method: metodo, url: `/v1/despacho${url}`,
      headers: { authorization: `Bearer ${user}`, 'x-loja-id': loja },
      ...(corpo === undefined ? {} : { payload: corpo as object }),
    })
    return { status: res.statusCode, corpo: res.body ? res.json() : null, body: res.body }
  }
  const A = (m: NonNullable<InjectOptions['method']>, url: string, corpo?: unknown) => chamar(dono, lojaA, m, url, corpo)

  beforeAll(async () => {
    dono = await criarUsuario(cenario)
    atendente = await criarUsuario(cenario)
    donoB = await criarUsuario(cenario)
    const contaA = await criarConta(cenario, dono)
    const contaB = await criarConta(cenario, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaA, atendente, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    zonaA = (await q(
      `insert into public.zonas_entrega (loja_id, nome, tipo, bairro, taxa_cliente_centavos, valor_motoboy_centavos)
       values ($1,'Centro','bairro','Centro',500,700) returning id`, [lojaA],
    )).id
    motoboyA = await motoboy(lojaA, 'Joao Entregador')
    motoboyInativo = await motoboy(lojaA, 'Ze Inativo', false)
    motoboyB = await motoboy(lojaB, 'Outro da B')
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado', SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173', RATE_LIMIT_MAX: '100000',
    })
    app = await construirApp({
      env, pool: poolApi, logger: criarLogger('despacho-teste', 'silent'), verificador: verificadorFake,
      modulos: [{ prefixo: 'despacho', plugin: despachoRoutes }],
    })
    await app.ready()
  })

  afterAll(async () => {
    if (app) await app.close()
    await poolSuper.query('delete from public.eventos where loja_id = any($1)', [[lojaA, lojaB]])
    await limpar(cenario)
    await fecharPools()
  })

  it('atribui motoboy ao pedido com snapshot do nome, sem mexer no status', async () => {
    const p = await pedido(lojaA)
    const r = await A('POST', `/pedidos/${p}/motoboy`, { motoboy_id: motoboyA })
    expect(r.status, r.body).toBe(200)
    expect(r.corpo).toMatchObject({ pedido_id: p, motoboy_id: motoboyA, motoboy_nome: 'Joao Entregador' })
    await poolSuper.query("update public.pessoas set nome = 'Renomeado' where loja_id = $1 and nome = 'Joao Entregador'", [lojaA])
    expect(await estado(p)).toMatchObject({ status: 'em_preparo', motoboy_nome: 'Joao Entregador' })
    await poolSuper.query("update public.pessoas set nome = 'Joao Entregador' where loja_id = $1 and nome = 'Renomeado'", [lojaA])
    const ev = await q<{ n: number }>("select count(*)::int as n from public.eventos where entidade_id = $1 and tipo = 'pedido.motoboy_atribuido'", [p])
    expect(ev.n).toBe(1)
  })

  it('rejeita motoboy inativo (422), de outra loja (404), retirada (422) e pedido entregue (409)', async () => {
    const p = await pedido(lojaA)
    expect((await A('POST', `/pedidos/${p}/motoboy`, { motoboy_id: motoboyInativo })).corpo.error.code).toBe('motoboy_inativo')
    expect((await A('POST', `/pedidos/${p}/motoboy`, { motoboy_id: motoboyB })).status).toBe(404)
    const ret = await pedido(lojaA, { modalidade: 'retirada' })
    const r1 = await A('POST', `/pedidos/${ret}/motoboy`, { motoboy_id: motoboyA })
    expect(r1.status).toBe(422)
    expect(r1.corpo.error.code).toBe('pedido_nao_entrega')
    const ent = await pedido(lojaA, { status: 'entregue' })
    const r2 = await A('POST', `/pedidos/${ent}/motoboy`, { motoboy_id: motoboyA })
    expect(r2.status).toBe(409)
    expect(r2.corpo.error.code).toBe('pedido_entregue')
    const ras = await pedido(lojaA, { status: 'rascunho' })
    expect((await A('POST', `/pedidos/${ras}/motoboy`, { motoboy_id: motoboyA })).corpo.error.code).toBe('pedido_nao_despachavel')
  })

  it('troca e remove motoboy com auditoria; corpo com loja_id forjado e 400', async () => {
    const p = await pedido(lojaA)
    const outro = await motoboy(lojaA, 'Maria Moto')
    await A('POST', `/pedidos/${p}/motoboy`, { motoboy_id: motoboyA })
    expect((await A('POST', `/pedidos/${p}/motoboy`, { motoboy_id: outro })).status).toBe(200)
    expect((await estado(p)).motoboy_id).toBe(outro)
    const rem = await A('POST', `/pedidos/${p}/motoboy/remover`)
    expect(rem.corpo).toMatchObject({ motoboy_id: null, motoboy_nome: null })
    const tipos = (await poolSuper.query('select tipo from public.eventos where entidade_id = $1 order by id', [p])).rows.map((r) => r.tipo)
    expect(tipos).toEqual(['pedido.motoboy_atribuido', 'pedido.motoboy_trocado', 'pedido.motoboy_removido'])
    const forjado = await A('POST', `/pedidos/${p}/motoboy`, { motoboy_id: motoboyA, loja_id: lojaB })
    expect(forjado.status).toBe(400)
  })

  it('ciclo da corrida: compor, reordenar, despachar (idempotente), concluir; valor do motoboy da zona', async () => {
    const p1 = await pedido(lojaA, { zona: zonaA })
    const p2 = await pedido(lojaA, { zona: zonaA })
    const p3 = await pedido(lojaA, { status: 'novo' })
    const c = await A('POST', '/corridas', { pedido_ids: [p1, p2] })
    expect(c.status, c.body).toBe(201)
    const id = c.corpo.id
    expect(c.corpo).toMatchObject({ status: 'montando', sugerida: false, cancelada: false, valor_motoboy_total_centavos: 1400 })
    expect(c.corpo.paradas.map((x: { pedido_id: string; ordem_parada: number }) => [x.pedido_id, x.ordem_parada])).toEqual([[p1, 1], [p2, 2]])

    // Despachar sem motoboy: 422.
    expect((await A('POST', `/corridas/${id}/despachar`)).corpo.error.code).toBe('corrida_sem_motoboy')

    const add = await A('POST', `/corridas/${id}/pedidos`, { pedido_ids: [p3] })
    expect(add.corpo.paradas.map((x: { ordem_parada: number }) => x.ordem_parada)).toEqual([1, 2, 3])

    // Reordenar exige a lista completa, sem repetir.
    expect((await A('PUT', `/corridas/${id}/ordem`, { pedido_ids: [p3, p1] })).corpo.error.code).toBe('ordem_invalida')
    expect((await A('PUT', `/corridas/${id}/ordem`, { pedido_ids: [p3, p3, p1] })).corpo.error.code).toBe('ordem_invalida')
    const ord = await A('PUT', `/corridas/${id}/ordem`, { pedido_ids: [p3, p1, p2] })
    expect(ord.corpo.paradas.map((x: { pedido_id: string }) => x.pedido_id)).toEqual([p3, p1, p2])

    // Remover renumera sem buracos.
    const rem = await A('POST', `/corridas/${id}/pedidos/${p1}/remover`)
    expect(rem.corpo.paradas.map((x: { ordem_parada: number }) => x.ordem_parada)).toEqual([1, 2])
    expect(await estado(p1)).toMatchObject({ corrida_id: null, ordem_parada: null })
    await A('POST', `/corridas/${id}/pedidos`, { pedido_ids: [p1] })

    // Motoboy da corrida propaga a todos.
    const mot = await A('POST', `/corridas/${id}/motoboy`, { motoboy_id: motoboyA })
    expect(mot.corpo.motoboy_nome).toBe('Joao Entregador')
    for (const p of [p1, p2, p3]) expect(await estado(p)).toMatchObject({ motoboy_id: motoboyA, motoboy_nome: 'Joao Entregador' })

    // Pedido na corrida: atribuicao individual e 409.
    expect((await A('POST', `/pedidos/${p1}/motoboy`, { motoboy_id: motoboyA })).corpo.error.code).toBe('pedido_em_corrida')

    const d1 = await A('POST', `/corridas/${id}/despachar`)
    expect(d1.status, d1.body).toBe(200)
    expect(d1.corpo.status).toBe('despachada')
    const quando = d1.corpo.despachada_em
    const d2 = await A('POST', `/corridas/${id}/despachar`)
    expect(d2.corpo.despachada_em).toBe(quando)

    // Composicao travada apos despachar.
    const extra = await pedido(lojaA)
    expect((await A('POST', `/corridas/${id}/pedidos`, { pedido_ids: [extra] })).corpo.error.code).toBe('corrida_imutavel')
    expect((await A('POST', `/corridas/${id}/cancelar`)).corpo.error.code).toBe('corrida_ja_despachada')

    // Status do pedido intocado.
    expect((await estado(p1)).status).toBe('em_preparo')

    const painel = await A('GET', '/')
    expect(painel.status).toBe(200)
    const naPainel = painel.corpo.corridas.find((x: { id: string }) => x.id === id)
    expect(naPainel.paradas).toHaveLength(3)
    expect(painel.corpo.motoboys.find((m: { id: string }) => m.id === motoboyA)).toMatchObject({ corridas_abertas: 1 })
    expect(painel.corpo.pedidos_prontos.some((x: { pedido_id: string }) => x.pedido_id === extra)).toBe(true)

    const fim = await A('POST', `/corridas/${id}/concluir`)
    expect(fim.corpo.status).toBe('concluida')
    expect(fim.corpo.concluida_em).not.toBeNull()
    expect((await A('POST', `/corridas/${id}/concluir`)).status).toBe(200)
    const painel2 = await A('GET', '/')
    expect(painel2.corpo.corridas.some((x: { id: string }) => x.id === id)).toBe(false)
  })

  it('despachar corrida vazia: 422; concluir antes de despachar: 409', async () => {
    const c = await A('POST', '/corridas', { motoboy_id: motoboyA })
    expect((await A('POST', `/corridas/${c.corpo.id}/despachar`)).corpo.error.code).toBe('corrida_vazia')
    expect((await A('POST', `/corridas/${c.corpo.id}/concluir`)).corpo.error.code).toBe('corrida_nao_despachada')
  })

  it('cancelar libera os pedidos e o motoboy que veio da corrida; idempotente', async () => {
    const p = await pedido(lojaA)
    const c = await A('POST', '/corridas', { motoboy_id: motoboyA, pedido_ids: [p] })
    expect(await estado(p)).toMatchObject({ motoboy_id: motoboyA })
    const r = await A('POST', `/corridas/${c.corpo.id}/cancelar`)
    expect(r.status, r.body).toBe(200)
    expect(r.corpo).toMatchObject({ status: 'concluida', cancelada: true, despachada_em: null })
    expect(await estado(p)).toMatchObject({ corrida_id: null, ordem_parada: null, motoboy_id: null, motoboy_nome: null })
    expect((await A('POST', `/corridas/${c.corpo.id}/cancelar`)).status).toBe(200)
  })

  it('pedido em duas corridas: uma vence, a outra recebe 409 (concorrencia)', async () => {
    const p = await pedido(lojaA)
    const c1 = (await A('POST', '/corridas', {})).corpo.id
    const c2 = (await A('POST', '/corridas', {})).corpo.id
    const [r1, r2] = await Promise.all([
      A('POST', `/corridas/${c1}/pedidos`, { pedido_ids: [p] }),
      A('POST', `/corridas/${c2}/pedidos`, { pedido_ids: [p] }),
    ])
    expect([r1.status, r2.status].sort()).toEqual([200, 409])
    const perdedora = r1.status === 409 ? r1 : r2
    expect(perdedora.corpo.error.code).toBe('pedido_em_corrida')
  })

  it('pedido de retirada ou fora de estado nao entra em corrida (422)', async () => {
    const c = (await A('POST', '/corridas', {})).corpo.id
    const ret = await pedido(lojaA, { modalidade: 'retirada' })
    expect((await A('POST', `/corridas/${c}/pedidos`, { pedido_ids: [ret] })).corpo.error.code).toBe('pedido_nao_entrega')
    const saiu = await pedido(lojaA, { status: 'saiu_entrega' })
    expect((await A('POST', `/corridas/${c}/pedidos`, { pedido_ids: [saiu] })).corpo.error.code).toBe('pedido_nao_despachavel')
  })

  it('isolamento: corrida/pedido/motoboy de outra loja inacessiveis (404)', async () => {
    const pB = await pedido(lojaB)
    const cB = (await chamar(donoB, lojaB, 'POST', '/corridas', {})).corpo.id
    expect((await A('GET', `/corridas/${cB}`)).status).toBe(404)
    expect((await A('POST', `/corridas/${cB}/despachar`)).status).toBe(404)
    expect((await A('POST', `/pedidos/${pB}/motoboy`, { motoboy_id: motoboyA })).status).toBe(404)
    const cA = (await A('POST', '/corridas', {})).corpo.id
    expect((await A('POST', `/corridas/${cA}/pedidos`, { pedido_ids: [pB] })).status).toBe(404)
    expect((await A('POST', '/corridas', { motoboy_id: motoboyB })).status).toBe(404)
    expect((await estado(pB)).corrida_id).toBeNull()
  })

  it('atendente opera o despacho; sem login: 401', async () => {
    expect((await chamar(atendente, lojaA, 'GET', '/')).status).toBe(200)
    const r = await app.inject({ method: 'GET', url: '/v1/despacho/', headers: { 'x-loja-id': lojaA } })
    expect(r.statusCode).toBe(401)
  })

  it('whaviso_api nao tem DELETE em corridas (SEC-030)', async () => {
    await expect(poolApi.query('delete from public.corridas where false')).rejects.toThrow(/permiss(ão|ion) negada|permission denied/)
  })
})
