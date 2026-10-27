// Integracao do modulo campanhas contra o Postgres local (role whaviso_api).
// Cobre criacao/disparo/cancelamento, preview do publico, e a SEGURANCA da feature:
//   SEC-110 campanha nunca cruza loja (destinatarios e numero so da propria loja);
//   SEC-111 so dispara dentro de template APROVADO pela Meta; opt-out sempre excluido;
//   enfileira na outbox `envios` como TEMPLATE (caminho sancionado fora da janela de 24h).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Writable } from 'node:stream'
import { randomUUID, createHash } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { campanhasRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[campanhas] banco inacessivel: integracao PULADA.')

const logs: string[] = []
const destino = new Writable({
  write(chunk: Buffer, _enc, cb) {
    logs.push(chunk.toString('utf8'))
    cb()
  },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reg = Record<string, any>

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

d('modulo campanhas (integracao)', () => {
  const cen = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let dono = '', atend = '', donoB = ''
  let lojaA = '', lojaB = ''
  let numeroA = '', numeroPausadoA = '', numeroB = ''
  // clientes de A
  let c1 = '', c2 = '', optout = '', campeaoA = ''
  let clienteB = ''

  const chamar = (user: string, loja: string | null, metodo: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/campanhas${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  async function cliente(loja: string, nome: string): Promise<string> {
    const id = randomUUID()
    await poolSuper.query(
      'insert into public.clientes (id, loja_id, telefone_hash, nome) values ($1,$2,$3,$4)',
      [id, loja, hash(id), nome],
    )
    return id
  }
  async function optOut(cli: string, loja: string) {
    await poolSuper.query(
      `insert into public.cliente_consentimento (loja_id, cliente_id, opt_out_marketing, opt_out_em, origem)
       values ($1,$2,true, now(), 'cliente_whatsapp')`,
      [loja, cli],
    )
  }
  let seq = 0
  async function pedidoEntregue(loja: string, cli: string, total: number) {
    await poolSuper.query(
      `insert into public.pedidos (id, loja_id, cliente_id, codigo, status, subtotal_centavos, total_centavos,
                                   modalidade, criado_em, entregue_em)
       values ($1,$2,$3,$4,'entregue',$5,$5,'retirada', now() - interval '1 day', now() - interval '1 day')`,
      [randomUUID(), loja, cli, `T${++seq}`, total],
    )
  }
  async function numero(loja: string, status = 'conectado'): Promise<string> {
    const id = randomUUID()
    await poolSuper.query(
      `insert into public.numeros_whatsapp (id, loja_id, phone_number_id, waba_id, status)
       values ($1,$2,$3,$4,$5::status_numero)`,
      [id, loja, `pn_${id}`, `waba_${id}`, status],
    )
    return id
  }
  async function template(
    loja: string | null, chave: string, variaveis: string[], status: string, ativo: boolean,
  ) {
    await poolSuper.query(
      `insert into public.templates (loja_id, chave, nome_meta, conteudo, variaveis, status_meta, ativo)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::status_meta_template,$7)`,
      [loja, chave, `camp_${chave}_${loja ?? 'pf'}`.replace(/[^a-z0-9_]/g, '_'),
       JSON.stringify({ texto: 'Ola! Aproveite {{1}}' }), JSON.stringify(variaveis), status, ativo],
    )
  }
  const criarCamp = (loja: string, body: Partial<Reg>) =>
    chamar(dono, loja, 'POST', '/', {
      nome: 'Promo', template_chave: 'camp.promo', numero_whatsapp_id: numeroA,
      filtro: {}, variaveis: { cupom: 'DESC10' }, ...body,
    })

  beforeAll(async () => {
    dono = await criarUsuario(cen)
    atend = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, dono)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaA, atend, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)

    numeroA = await numero(lojaA)
    numeroPausadoA = await numero(lojaA, 'pausado')
    numeroB = await numero(lojaB)

    // Templates: aprovado+ativo (promo), ativo-mas-pendente (nao aprovado), inativo.
    await template(lojaA, 'camp.promo', ['cupom'], 'aprovado', true)
    await template(lojaA, 'camp.pendente', ['cupom'], 'pendente', true)
    await template(lojaA, 'camp.inativo', ['cupom'], 'aprovado', false)
    await template(lojaB, 'camp.promo', ['cupom'], 'aprovado', true)

    c1 = await cliente(lojaA, 'Cliente 1')
    c2 = await cliente(lojaA, 'Cliente 2')
    optout = await cliente(lojaA, 'Nao perturbe')
    await optOut(optout, lojaA)
    campeaoA = await cliente(lojaA, 'Campeao')
    for (let i = 0; i < 6; i++) await pedidoEntregue(lojaA, campeaoA, 10000)
    clienteB = await cliente(lojaB, 'Cliente da B')

    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('campanhas-teste', 'info', destino),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'campanhas', plugin: campanhasRoutes }],
    })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    for (const l of [lojaA, lojaB]) {
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  it('cria campanha em rascunho e lista/detalha; numero invalido e 422', async () => {
    const r = await criarCamp(lojaA, { nome: 'Promo A' })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json()).toMatchObject({ nome: 'Promo A', status: 'rascunho', total_destinatarios: 0 })
    const id = r.json().id

    const lista = await chamar(dono, lojaA, 'GET', '/')
    expect(lista.json().itens.map((i: Reg) => i.id)).toContain(id)

    const det = await chamar(dono, lojaA, 'GET', `/${id}`)
    expect(det.statusCode).toBe(200)
    expect(det.json().variaveis).toMatchObject({ cupom: 'DESC10' })
    expect(det.json().entrega).toMatchObject({ enfileirados: 0, enviados: 0 })

    // numero de outra loja: recusado (SEC-110, nao cruza loja)
    const alheio = await criarCamp(lojaA, { numero_whatsapp_id: numeroB })
    expect(alheio.statusCode).toBe(422)
    expect(alheio.json().error.code).toBe('numero_indisponivel')
    // numero pausado tambem nao serve
    const pausado = await criarCamp(lojaA, { numero_whatsapp_id: numeroPausadoA })
    expect(pausado.statusCode).toBe(422)
  })

  it('preview de destinatarios exclui opt-out e respeita a loja', async () => {
    const r = await criarCamp(lojaA, {})
    const id = r.json().id
    const prev = await chamar(dono, lojaA, 'GET', `/${id}/destinatarios`)
    expect(prev.statusCode).toBe(200)
    // c1, c2, campeao -> 3 contactaveis; optout fora
    expect(prev.json().total).toBe(3)
  })

  it('dispara so por template APROVADO; opt-out nunca entra; enfileira como TEMPLATE na outbox', async () => {
    const r = await criarCamp(lojaA, { nome: 'Disparo' })
    const id = r.json().id
    const disp = await chamar(dono, lojaA, 'POST', `/${id}/disparar`)
    expect(disp.statusCode, disp.body).toBe(200)
    expect(disp.json()).toMatchObject({ status: 'enfileirada', total_destinatarios: 3, enfileirados: 3 })

    // outbox: 3 envios, todos TEMPLATE (template_chave setado + payload tipo template), nenhum p/ optout
    const env = await poolSuper.query(
      `select e.cliente_id, e.template_chave, e.payload->>'tipo' as tipo, e.status::text as status,
              e.destinatario_hash
         from public.envios e
         join public.campanha_envios ce on ce.envio_id = e.id
        where ce.campanha_id = $1`,
      [id],
    )
    expect(env.rows).toHaveLength(3)
    const ids = env.rows.map((x: Reg) => x.cliente_id)
    expect(ids).toEqual(expect.arrayContaining([c1, c2, campeaoA]))
    expect(ids).not.toContain(optout) // SEC: opt-out excluido
    expect(ids).not.toContain(clienteB) // SEC-110: nao cruza loja
    for (const row of env.rows) {
      expect(row.template_chave).toBe('camp.promo')
      expect(row.tipo).toBe('template') // SEC-111: janela de 24h respeitada por template
      expect(row.destinatario_hash).toMatch(/^[0-9a-f]{64}$/)
    }

    // re-disparo e no-op de negocio (idempotente): 422 e sem envios duplicados
    const de2 = await chamar(dono, lojaA, 'POST', `/${id}/disparar`)
    expect(de2.statusCode).toBe(422)
    expect(de2.json().error.code).toBe('campanha_nao_disparavel')
  })

  it('bloqueia template nao aprovado e inativo (SEC-111) e variaveis incompletas', async () => {
    const pend = await criarCamp(lojaA, { template_chave: 'camp.pendente' })
    const d1 = await chamar(dono, lojaA, 'POST', `/${pend.json().id}/disparar`)
    expect(d1.statusCode).toBe(422)
    expect(d1.json().error.code).toBe('template_nao_aprovado')

    const inat = await criarCamp(lojaA, { template_chave: 'camp.inativo' })
    const d2 = await chamar(dono, lojaA, 'POST', `/${inat.json().id}/disparar`)
    expect(d2.statusCode).toBe(422)
    expect(d2.json().error.code).toBe('template_indisponivel')

    const semVar = await criarCamp(lojaA, { variaveis: {} })
    const d3 = await chamar(dono, lojaA, 'POST', `/${semVar.json().id}/disparar`)
    expect(d3.statusCode).toBe(422)
    expect(d3.json().error.code).toBe('variaveis_incompletas')
  })

  it('filtro por segmento so atinge o segmento pedido', async () => {
    const r = await criarCamp(lojaA, { filtro: { segmento: 'campeao' } })
    const id = r.json().id
    const prev = await chamar(dono, lojaA, 'GET', `/${id}/destinatarios`)
    expect(prev.json()).toMatchObject({ total: 1, segmento: 'campeao' })
    const disp = await chamar(dono, lojaA, 'POST', `/${id}/disparar`)
    expect(disp.json().enfileirados).toBe(1)
    const env = await poolSuper.query(
      'select cliente_id from public.campanha_envios where campanha_id = $1', [id],
    )
    expect(env.rows.map((x: Reg) => x.cliente_id)).toEqual([campeaoA])
  })

  it('cancela: aborta os envios ainda nao enviados na outbox', async () => {
    const r = await criarCamp(lojaA, { nome: 'Para cancelar' })
    const id = r.json().id
    await chamar(dono, lojaA, 'POST', `/${id}/disparar`)
    const canc = await chamar(dono, lojaA, 'POST', `/${id}/cancelar`)
    expect(canc.statusCode, canc.body).toBe(200)
    expect(canc.json()).toMatchObject({ status: 'cancelada', cancelados: 3 })
    const env = await poolSuper.query(
      `select distinct e.status::text as status from public.envios e
         join public.campanha_envios ce on ce.envio_id = e.id where ce.campanha_id = $1`,
      [id],
    )
    expect(env.rows.map((x: Reg) => x.status)).toEqual(['cancelado'])
  })

  it('RBAC: atendente nao gere campanhas (403); sem x-loja-id recusado', async () => {
    expect((await chamar(atend, lojaA, 'GET', '/')).statusCode).toBe(403)
    const criar = await chamar(atend, lojaA, 'POST', '/', {
      nome: 'x', template_chave: 'camp.promo', numero_whatsapp_id: numeroA, variaveis: {},
    })
    expect(criar.statusCode).toBe(403)
    expect((await chamar(dono, null, 'GET', '/')).statusCode).toBeGreaterThanOrEqual(400)
  })

  it('SEC-110: loja B nao ve nem dispara campanha da A; sem PII na resposta', async () => {
    const r = await criarCamp(lojaA, { nome: 'So da A' })
    const id = r.json().id
    expect((await chamar(donoB, lojaB, 'GET', `/${id}`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', `/${id}/disparar`)).statusCode).toBe(404)
    const det = await chamar(dono, lojaA, 'GET', `/${id}`)
    expect(det.body).not.toMatch(/telefone/i)
    // nenhum log vazou hash/telefone
    expect(logs.join('\n')).not.toMatch(/telefone|destinatario_hash/i)
  })

  it('validacao: corpo com campo extra e 400 no envelope', async () => {
    const r = await chamar(dono, lojaA, 'POST', '/', {
      nome: 'x', template_chave: 'camp.promo', numero_whatsapp_id: numeroA, variaveis: {}, loja_id: lojaB,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json()).toHaveProperty('error.code')
  })
})
