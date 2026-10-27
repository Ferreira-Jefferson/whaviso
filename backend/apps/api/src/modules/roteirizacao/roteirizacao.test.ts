// Integracao da roteirizacao: config, geocode (cache em enderecos), sugerir (sem persistir), aceitar
// (atomico/concorrente), reordenar, isolamento entre lojas, degradacao sem provedor e SEC-070 (o modulo
// nao contorna o ClienteMapas). Roda no Postgres LOCAL whaviso_dev com a app real e o FAKE de mapas;
// se offline, pula a parte de banco.
import { readdirSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { InjectOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FakeClienteMapas, Transitorio } from '@whaviso/shared/clientes'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar, novoCenario,
  poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarRoteirizacaoRoutes } from './routes'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[roteirizacao] banco inacessivel: integracao PULADA.')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
type Resp = { status: number; corpo: any; body: string }

async function q<T = { id: string }>(sql: string, params: unknown[]): Promise<T> {
  return (await poolSuper.query(sql, params)).rows[0] as T
}

const ORIGEM = { lat: -23.55, lng: -46.63 }
const consulta = (rua: string, numero: string, bairro: string) =>
  `${rua}, ${numero}, ${bairro}, Sao Paulo - SP, 01000000, Brasil`

describe('SEC-070: o modulo nao contorna o ClienteMapas', () => {
  it('nenhum arquivo do modulo importa fetch/undici/axios/http direto', () => {
    const dir = __dirname
    const proibidos = /\b(undici|axios|node-fetch)\b|from ['"]node:(http|https|net|dns)['"]|\bfetch\s*\(/
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(proibidos)
    }
  })
})

d('modulo roteirizacao', () => {
  const cenario = novoCenario()
  const mapas = new FakeClienteMapas({
    enderecos: {
      [consulta('Rua Perto Um', '10', 'Centro')]: { lat: -23.55, lng: -46.63 },
      [consulta('Rua Perto Dois', '20', 'Centro')]: { lat: -23.552, lng: -46.632 },
      [consulta('Rua Longe', '30', 'Distante')]: { lat: -23.75, lng: -46.63 }, // ~22 km (dentro do raio)
      [consulta('Rua Fora', '40', 'Outra Cidade')]: { lat: -22.91, lng: -43.17 }, // ~350 km
    },
  })
  let app: Awaited<ReturnType<typeof construirApp>>
  let dono = '', atendente = '', donoB = ''
  let lojaA = '', lojaB = ''
  let clienteA = '', clienteB = ''
  let motoboyA = '', motoboyInativo = '', motoboyB = ''

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

  async function cliente(loja: string): Promise<string> {
    return (await q(
      'insert into public.clientes (loja_id, telefone_hash, nome) values ($1,$2,$3) returning id',
      [loja, randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''), 'Fulano Sigiloso'],
    )).id
  }

  async function endereco(loja: string, cli: string, rua: string, numero: string, bairro: string): Promise<string> {
    return (await q(
      `insert into public.enderecos (loja_id, cliente_id, logradouro, numero, bairro, cidade, uf, cep)
       values ($1,$2,$3,$4,$5,'Sao Paulo','SP','01000000') returning id`,
      [loja, cli, rua, numero, bairro],
    )).id
  }

  async function pedido(
    loja: string,
    o: { status?: string; modalidade?: string; endereco?: string | null; itens?: number; criadoMinAtras?: number } = {},
  ): Promise<string> {
    const id = (await q(
      `insert into public.pedidos (loja_id, codigo, status, modalidade, subtotal_centavos, total_centavos, endereco_id, criado_em)
       values ($1,$2,$3::status_pedido,$4::modalidade_pedido,2000,2000,$5, now() - ($6 || ' minutes')::interval) returning id`,
      [loja, `R${randomUUID().slice(0, 8)}`, o.status ?? 'em_preparo', o.modalidade ?? 'entrega',
        o.endereco ?? null, String(o.criadoMinAtras ?? 0)],
    )).id
    for (let i = 0; i < (o.itens ?? 1); i++) {
      await poolSuper.query(
        `insert into public.itens_pedido (pedido_id, loja_id, nome_snapshot, preco_unitario_centavos, quantidade, total_centavos)
         values ($1,$2,'Item',1000,1,1000)`, [id, loja],
      )
    }
    return id
  }

  const estado = (id: string) =>
    q<{ status: string; corrida_id: string | null; ordem_parada: number | null; motoboy_id: string | null }>(
      'select status, corrida_id, ordem_parada, motoboy_id from public.pedidos where id = $1', [id],
    )
  const geo = (id: string) =>
    q<{ lat: string | null; lng: string | null; geocodificado_em: string | null; geocode_falha_em: string | null }>(
      'select lat, lng, geocodificado_em, geocode_falha_em from public.enderecos where id = $1', [id],
    )
  const nCorridas = async (loja: string) =>
    (await q<{ n: number }>('select count(*)::int as n from public.corridas where loja_id = $1', [loja])).n

  async function chamar(
    user: string, loja: string, metodo: NonNullable<InjectOptions['method']>, url: string, corpo?: unknown,
  ): Promise<Resp> {
    const res = await app.inject({
      method: metodo, url: `/v1/roteirizacao${url}`,
      headers: { authorization: `Bearer ${user}`, 'x-loja-id': loja },
      ...(corpo === undefined ? {} : { payload: corpo as object }),
    })
    return { status: res.statusCode, corpo: res.body ? res.json() : null, body: res.body }
  }
  const A = (m: NonNullable<InjectOptions['method']>, url: string, corpo?: unknown) => chamar(dono, lojaA, m, url, corpo)
  /** Geocodifica so os enderecos desses pedidos (via sugerir), sem depender do tamanho da fila da loja. */
  const geocodificarDe = (...pedidos: string[]) => A('POST', '/sugerir', { pedido_ids: pedidos })

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
    clienteA = await cliente(lojaA)
    clienteB = await cliente(lojaB)
    motoboyA = await motoboy(lojaA, 'Joao Entregador')
    motoboyInativo = await motoboy(lojaA, 'Ze Inativo', false)
    motoboyB = await motoboy(lojaB, 'Outro da B')
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado', SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173', RATE_LIMIT_MAX: '100000',
    })
    app = await construirApp({
      env, pool: poolApi, logger: criarLogger('roteirizacao-teste', 'silent'), verificador: verificadorFake,
      modulos: [{ prefixo: 'roteirizacao', plugin: criarRoteirizacaoRoutes(mapas, { pausaGeocodeMs: 0, rateLimitFator: 100 }) }],
    })
    await app.ready()
    const r = await A('PUT', '/config', { origem_lat: ORIGEM.lat, origem_lng: ORIGEM.lng })
    expect(r.status, r.body).toBe(200)
  })

  afterAll(async () => {
    if (app) await app.close()
    await poolSuper.query('delete from public.eventos where loja_id = any($1)', [[lojaA, lojaB]])
    await limpar(cenario)
    await fecharPools()
  })

  it('config: defaults, patch, validacao e permissao (atendente le, nao altera)', async () => {
    const r = await chamar(donoB, lojaB, 'GET', '/config')
    expect(r.status, r.body).toBe(200)
    expect(r.corpo).toMatchObject({
      preparo_base_min: 20, preparo_por_item_min: 1, max_pedidos_corrida: 4, janela_saida_min: 10,
      desvio_max_min: 8, origem_lat: null, origem_lng: null, volta_a_loja: false, velocidade_media_kmh: 25,
    })
    const p = await A('PUT', '/config', { max_pedidos_corrida: 3, desvio_max_min: 12 })
    expect(p.corpo).toMatchObject({ max_pedidos_corrida: 3, desvio_max_min: 12, origem_lat: ORIGEM.lat })
    expect((await A('PUT', '/config', { max_pedidos_corrida: 11 })).status).toBe(400)
    expect((await A('PUT', '/config', { origem_lat: -23 })).status).toBe(400)
    expect((await A('PUT', '/config', { loja_id: lojaB })).status).toBe(400)
    expect((await chamar(atendente, lojaA, 'GET', '/config')).status).toBe(200)
    expect((await chamar(atendente, lojaA, 'PUT', '/config', { max_pedidos_corrida: 2 })).status).toBe(403)
    // a config de A nao vaza para B
    expect((await chamar(donoB, lojaB, 'GET', '/config')).corpo.max_pedidos_corrida).toBe(4)
    await A('PUT', '/config', { max_pedidos_corrida: 4, desvio_max_min: 8 })
    // dono de B nao opera na loja A
    expect((await chamar(donoB, lojaA, 'GET', '/config')).status).toBeGreaterThanOrEqual(400)
  })

  it('sugerir: agrupa por proximidade, separa sem localizacao, geocodifica e NAO persiste corrida', async () => {
    const e1 = await endereco(lojaA, clienteA, 'Rua Perto Um', '10', 'Centro')
    const e2 = await endereco(lojaA, clienteA, 'Rua Perto Dois', '20', 'Centro')
    const e3 = await endereco(lojaA, clienteA, 'Rua Longe', '30', 'Distante')
    const p1 = await pedido(lojaA, { endereco: e1, itens: 2 })
    const p2 = await pedido(lojaA, { endereco: e2, itens: 1 })
    const p3 = await pedido(lojaA, { endereco: e3, itens: 1 })
    const semEnd = await pedido(lojaA)
    const retirada = await pedido(lojaA, { modalidade: 'retirada', endereco: e1 })
    const entregue = await pedido(lojaA, { status: 'entregue', endereco: e1 })
    const eB = await endereco(lojaB, clienteB, 'Rua Perto Um', '10', 'Centro')
    const pB = await pedido(lojaB, { endereco: eB })
    const antes = await nCorridas(lojaA)
    const idsAntes = mapas.chamadas.length

    const r = await A('POST', '/sugerir', { pedido_ids: [p1, p2, p3, semEnd, retirada, entregue, pB] })
    expect(r.status, r.body).toBe(200)
    expect(r.corpo.origem_configurada).toBe(true)
    expect(r.corpo.estimado).toBe(false)
    const grupos: string[][] = r.corpo.corridas.map((c: { paradas: { pedido_id: string }[] }) => c.paradas.map((x) => x.pedido_id))
    expect(grupos).toHaveLength(2)
    const juntos = grupos.find((g) => g.length === 2)!
    expect([...juntos].sort()).toEqual([p1, p2].sort())
    expect(grupos.find((g) => g.length === 1)).toEqual([p3])
    expect(r.corpo.corridas.map((c: { ordem_saida: number }) => c.ordem_saida)).toEqual([1, 2])
    expect(r.corpo.corridas[0].paradas.map((x: { ordem_parada: number }) => x.ordem_parada)).toEqual(
      r.corpo.corridas[0].paradas.map((_: unknown, i: number) => i + 1),
    )
    expect(r.corpo.sem_localizacao).toEqual([{ pedido_id: semEnd, codigo: expect.any(String), motivo: 'sem_endereco' }])
    // outra loja, retirada e entregue sao ignorados (nao aparecem em lugar nenhum)
    const todos = JSON.stringify(r.corpo)
    for (const fora of [pB, retirada, entregue]) expect(todos).not.toContain(fora)
    // nada de corrida persistida; pedidos intactos
    expect(await nCorridas(lojaA)).toBe(antes)
    expect(await estado(p1)).toMatchObject({ corrida_id: null, ordem_parada: null, status: 'em_preparo' })
    // geocode gravado no proprio endereco (cache) e consulta SEM nome/telefone
    const g = await geo(e1)
    expect(Number(g.lat)).toBeCloseTo(-23.55, 5)
    expect(g.geocodificado_em).not.toBeNull()
    const consultas = mapas.chamadas.slice(idsAntes).filter((c) => c.operacao === 'geocodificar').map((c) => String(c.entrada))
    expect(consultas).toHaveLength(3)
    for (const c of consultas) expect(c).not.toMatch(/Fulano|Sigiloso|telefone/i)
    // segunda sugestao nao chama o provedor de novo para os mesmos enderecos
    const chamadasGeo = () => mapas.chamadas.filter((c) => c.operacao === 'geocodificar').length
    const n = chamadasGeo()
    await A('POST', '/sugerir', { pedido_ids: [p1, p2, p3] })
    expect(chamadasGeo()).toBe(n)
    // e de outra loja o mesmo texto de endereco nao reaproveita a coordenada de A
    expect((await geo(eB)).geocodificado_em).toBeNull()
  })

  it('sugerir: preparo maior empurra o pronto previsto e valida o corpo', async () => {
    const e = await endereco(lojaA, clienteA, 'Rua Perto Um', '10', 'Centro')
    const p = await pedido(lojaA, { endereco: e, itens: 4, criadoMinAtras: 5 })
    const r = await A('POST', '/sugerir', { pedido_ids: [p] })
    const parada = r.corpo.corridas[0].paradas[0]
    const criado = Date.parse((await q<{ t: string }>("select to_char(criado_em at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as t from public.pedidos where id = $1", [p])).t)
    expect(Date.parse(parada.pronto_previsto_em) - criado).toBe((20 + 4 * 1) * 60_000)
    expect((await A('POST', '/sugerir', { pedido_ids: [] })).status).toBe(400)
    expect((await A('POST', '/sugerir', { pedido_ids: ['x'] })).status).toBe(400)
    expect((await A('POST', '/sugerir', { loja_id: lojaB })).status).toBe(400)
    const muitos = Array.from({ length: 51 }, () => randomUUID())
    expect((await A('POST', '/sugerir', { pedido_ids: muitos })).status).toBe(400)
    const um = await A('POST', '/sugerir', { pedido_ids: [p], motoboys_disponiveis: 0 })
    expect(um.corpo.corridas[0].sem_motoboy).toBe(true)
  })

  it('geocode: falha permanente marca, registra evento sem endereco e nao repete; fora da area nao grava', async () => {
    const eInexistente = await endereco(lojaA, clienteA, 'Rua Que Nao Existe', '99', 'Nenhum')
    const eFora = await endereco(lojaA, clienteA, 'Rua Fora', '40', 'Outra Cidade')
    const pI = await pedido(lojaA, { endereco: eInexistente })
    const pF = await pedido(lojaA, { endereco: eFora })
    const r = await A('POST', '/sugerir', { pedido_ids: [pI, pF] })
    expect(r.status, r.body).toBe(200)
    expect(r.corpo.corridas).toEqual([])
    expect(r.corpo.sem_localizacao.map((x: { motivo: string }) => x.motivo)).toEqual(['geocode_falhou', 'geocode_falhou'])
    for (const id of [eInexistente, eFora]) {
      const g = await geo(id)
      expect(g.lat).toBeNull()
      expect(g.geocodificado_em).toBeNull()
      expect(g.geocode_falha_em).not.toBeNull()
      const ev = await q<{ detalhes: Record<string, unknown> }>(
        "select detalhes from public.eventos where entidade = 'endereco' and entidade_id = $1 and tipo = 'endereco.geocode_falhou'", [id],
      )
      expect(JSON.stringify(ev.detalhes)).not.toMatch(/Rua|Nenhum|Cidade|lat|lng/)
    }
    const n = mapas.chamadas.length
    await A('POST', '/sugerir', { pedido_ids: [pI, pF] })
    expect(mapas.chamadas.length).toBe(n) // nem geocode (marcados) nem matriz (sem aptos)
  })

  it('geocodificar-pendentes: processa o lote, grava coordenadas e informa o que sobrou', async () => {
    const e = await endereco(lojaA, clienteA, 'Rua Perto Dois', '20', 'Centro')
    await pedido(lojaA, { endereco: e }) // pedido aberto: o endereco entra na frente da fila
    const antes = await A('POST', '/geocodificar-pendentes', { limite: 25 })
    expect(antes.status, antes.body).toBe(200)
    expect((await geo(e)).geocodificado_em).not.toBeNull()
    expect(antes.corpo.geocodificados).toBeGreaterThanOrEqual(1)
    expect(antes.corpo.interrompido).toBe(false)
    const outra = await chamar(donoB, lojaB, 'POST', '/geocodificar-pendentes', {})
    expect(outra.status, outra.body).toBe(200)
    expect((await A('POST', '/geocodificar-pendentes', { limite: 99 })).status).toBe(400)
  })

  it('texto do endereco mudou: a geocodificacao e zerada (trigger)', async () => {
    const e = await endereco(lojaA, clienteA, 'Rua Perto Um', '10', 'Centro')
    await geocodificarDe(await pedido(lojaA, { endereco: e }))
    expect((await geo(e)).lat).not.toBeNull()
    await poolApi.query("update public.enderecos set numero = '11' where id = $1", [e])
    expect(await geo(e)).toMatchObject({ lat: null, lng: null, geocodificado_em: null })
  })

  it('aceitar: cria corrida sugerida, grava ordem de parada, nao muda status e audita', async () => {
    const e1 = await endereco(lojaA, clienteA, 'Rua Perto Um', '10', 'Centro')
    const e2 = await endereco(lojaA, clienteA, 'Rua Perto Dois', '20', 'Centro')
    const p1 = await pedido(lojaA, { endereco: e1 })
    const p2 = await pedido(lojaA, { endereco: e2, status: 'novo' })
    await geocodificarDe(p1, p2)
    const r = await A('POST', '/aceitar', { pedido_ids: [p2, p1], motoboy_id: motoboyA })
    expect(r.status, r.body).toBe(201)
    expect(r.corpo).toMatchObject({ sugerida: true, status: 'montando', motoboy_id: motoboyA })
    expect(r.corpo.paradas.map((x: { pedido_id: string; ordem_parada: number }) => [x.pedido_id, x.ordem_parada])).toEqual([[p2, 1], [p1, 2]])
    expect(await estado(p1)).toMatchObject({ corrida_id: r.corpo.id, ordem_parada: 2, status: 'em_preparo', motoboy_id: motoboyA })
    expect(await estado(p2)).toMatchObject({ ordem_parada: 1, status: 'novo' })
    const ev = await q<{ n: number }>("select count(*)::int as n from public.eventos where entidade_id = $1 and tipo = 'corrida.sugerida_aceita'", [r.corpo.id])
    expect(ev.n).toBe(1)
    // ja em corrida: sai de novo da sugestao
    const s = await A('POST', '/sugerir', { pedido_ids: [p1, p2] })
    expect(s.corpo.corridas).toEqual([])
  })

  it('aceitar: tudo ou nada (409 lista indisponiveis, 404 outra loja, motoboy invalido, repetidos)', async () => {
    const e = await endereco(lojaA, clienteA, 'Rua Perto Um', '10', 'Centro')
    const livre = await pedido(lojaA, { endereco: e })
    const ocupado = await pedido(lojaA, { endereco: e })
    expect((await A('POST', '/aceitar', { pedido_ids: [ocupado] })).status).toBe(201)
    const antes = await nCorridas(lojaA)
    const r = await A('POST', '/aceitar', { pedido_ids: [livre, ocupado] })
    expect(r.status).toBe(409)
    expect(r.corpo.error.code).toBe('pedidos_indisponiveis')
    expect(await nCorridas(lojaA)).toBe(antes)
    expect(await estado(livre)).toMatchObject({ corrida_id: null, ordem_parada: null })
    const retirada = await pedido(lojaA, { modalidade: 'retirada', endereco: e })
    expect((await A('POST', '/aceitar', { pedido_ids: [retirada] })).status).toBe(409)
    const eB = await endereco(lojaB, clienteB, 'Rua Perto Um', '10', 'Centro')
    const pB = await pedido(lojaB, { endereco: eB })
    expect((await A('POST', '/aceitar', { pedido_ids: [livre, pB] })).status).toBe(404)
    expect(await estado(pB)).toMatchObject({ corrida_id: null })
    expect((await A('POST', '/aceitar', { pedido_ids: [livre], motoboy_id: motoboyB })).status).toBe(404)
    const ini = await A('POST', '/aceitar', { pedido_ids: [livre], motoboy_id: motoboyInativo })
    expect(ini.corpo.error.code).toBe('motoboy_inativo')
    expect(await nCorridas(lojaA)).toBe(antes)
    expect((await A('POST', '/aceitar', { pedido_ids: [livre, livre] })).corpo.error.code).toBe('pedidos_repetidos')
    expect((await A('POST', '/aceitar', { pedido_ids: [livre], loja_id: lojaB })).status).toBe(400)
  })

  it('aceitar: dois aceites concorrentes com pedidos sobrepostos, so um vence', async () => {
    const e = await endereco(lojaA, clienteA, 'Rua Perto Um', '10', 'Centro')
    const [x, y, z] = [await pedido(lojaA, { endereco: e }), await pedido(lojaA, { endereco: e }), await pedido(lojaA, { endereco: e })]
    const antes = await nCorridas(lojaA)
    const [r1, r2] = await Promise.all([
      A('POST', '/aceitar', { pedido_ids: [x, y] }),
      A('POST', '/aceitar', { pedido_ids: [y, z] }),
    ])
    expect([r1.status, r2.status].sort()).toEqual([201, 409])
    expect(await nCorridas(lojaA)).toBe(antes + 1)
    const estados = await Promise.all([x, y, z].map(estado))
    expect(estados.filter((s) => s.corrida_id !== null)).toHaveLength(2) // so os 2 da corrida vencedora
  })

  it('reordenar: devolve a melhor ordem da lista manual e exige coordenadas; nao persiste', async () => {
    const lista: { id: string; rua: string; n: string; bairro: string }[] = [
      { id: '', rua: 'Rua Longe', n: '30', bairro: 'Distante' },
      { id: '', rua: 'Rua Perto Um', n: '10', bairro: 'Centro' },
      { id: '', rua: 'Rua Perto Dois', n: '20', bairro: 'Centro' },
    ]
    for (const it of lista) {
      const e = await endereco(lojaA, clienteA, it.rua, it.n, it.bairro)
      it.id = await pedido(lojaA, { endereco: e })
    }
    await geocodificarDe(...lista.map((x) => x.id))
    const [longe, um, dois] = lista.map((x) => x.id) as [string, string, string]
    const r = await A('POST', '/reordenar', { pedido_ids: [longe, dois, um] })
    expect(r.status, r.body).toBe(200)
    expect(r.corpo.pedido_ids).toEqual([um, dois, longe])
    expect(r.corpo.estimado).toBe(false)
    expect(r.corpo.tempo_total_min).toBeGreaterThan(0)
    expect(await estado(um)).toMatchObject({ corrida_id: null, ordem_parada: null })
    const sem = await pedido(lojaA)
    expect((await A('POST', '/reordenar', { pedido_ids: [um, sem] })).corpo.error.code).toBe('pedidos_sem_localizacao')
    const eB = await endereco(lojaB, clienteB, 'Rua Perto Um', '10', 'Centro')
    const pB = await pedido(lojaB, { endereco: eB })
    expect((await A('POST', '/reordenar', { pedido_ids: [um, pB] })).status).toBe(404)
  })

  it('provedor fora do ar: sugestao degrada para linha reta (estimado) e novos enderecos ficam pendentes', async () => {
    const e1 = await endereco(lojaA, clienteA, 'Rua Perto Um', '10', 'Centro')
    const e2 = await endereco(lojaA, clienteA, 'Rua Perto Dois', '20', 'Centro')
    const novo = await endereco(lojaA, clienteA, 'Rua Longe', '30', 'Distante')
    const [p1, p2, pn] = [await pedido(lojaA, { endereco: e1 }), await pedido(lojaA, { endereco: e2 }), await pedido(lojaA, { endereco: novo })]
    await geocodificarDe(p1, p2) // p3 fica de fora: o provedor cai antes dele ser geocodificado
    mapas.falharSempre(new Transitorio('fora do ar', { codigo: 'indisponivel' }))
    try {
      const r = await A('POST', '/sugerir', { pedido_ids: [p1, p2, pn] })
      expect(r.status, r.body).toBe(200)
      expect(r.corpo.estimado).toBe(true)
      expect(r.corpo.corridas[0].estimado).toBe(true)
      expect(r.corpo.sem_localizacao).toEqual([{ pedido_id: pn, codigo: expect.any(String), motivo: 'pendente' }])
      expect((await geo(novo)).geocode_falha_em).toBeNull() // transitorio nao marca falha
      const g = await A('POST', '/geocodificar-pendentes', {})
      expect(g.corpo.interrompido).toBe(true)
    } finally {
      mapas.falharSempre(undefined)
    }
  })

  it('respostas de erro nao carregam endereco nem coordenadas', async () => {
    const r = await A('POST', '/aceitar', { pedido_ids: [randomUUID()] })
    expect(r.status).toBe(404)
    expect(r.body).not.toMatch(/Rua|lat|lng/)
  })
})
