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
import { criarServicoCampanhas } from './service'

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

// Disparo direto no servico (a rota tem rate limit de 10/min por IP, que estouraria nos testes de frequencia).
const dispararC = (loja: string, user: string, id: string) =>
  criarServicoCampanhas(poolApi).disparar({ lojaId: loja, userId: user }, id)

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

d('modulo campanhas (integracao)', () => {
  const cen = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let dono = '', atend = '', donoB = '', donoC = ''
  let lojaA = '', lojaB = '', lojaC = '', numeroC = ''
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
    donoC = await criarUsuario(cen)
    const contaC = await criarConta(cen, donoC)
    lojaC = await criarLoja(contaC)
    await criarMembro(contaC, donoC, 'dono', null)
    // Os testes antigos disparam varias campanhas ao mesmo publico: desliga o limite so na loja A.
    await poolSuper.query('update public.lojas set campanha_freq_max = null where id = $1', [lojaA])
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaA, atend, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)

    numeroA = await numero(lojaA)
    numeroPausadoA = await numero(lojaA, 'pausado')
    numeroB = await numero(lojaB)
    numeroC = await numero(lojaC)
    await template(lojaC, 'camp.promo', ['cupom'], 'aprovado', true)

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
    for (const l of [lojaA, lojaB, lojaC]) {
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

  it('limite de frequencia: cliente no teto da janela e suprimido (nao falha); abaixo do teto recebe', async () => {
    await poolSuper.query(
      'update public.lojas set campanha_freq_max = 2, campanha_freq_janela_dias = 7 where id = $1', [lojaC],
    )
    const cheio = await cliente(lojaC, 'No teto')
    const metade = await cliente(lojaC, 'Abaixo do teto')
    const novo = await cliente(lojaC, 'Novo')
    const camp = () => chamar(donoC, lojaC, 'POST', '/', {
      nome: 'Freq', template_chave: 'camp.promo', numero_whatsapp_id: numeroC, filtro: {}, variaveis: { cupom: 'X' },
    })
    const disparar = async () => {
      const id = (await camp()).json().id as string
      return { id, body: await dispararC(lojaC, donoC, id) }
    }
    // 'cheio' e 'novo' recebem as duas primeiras; 'metade' tem a primeira cancelada (nao conta).
    const c1 = await disparar()
    expect(c1.body).toMatchObject({ enfileirados: 3 })
    await poolSuper.query(
      `update public.envios set status = 'cancelado'
        where id in (select envio_id from public.campanha_envios where campanha_id = $1 and cliente_id = $2)`,
      [c1.id, metade],
    )
    const c2 = await disparar()
    expect(c2.body).toMatchObject({ enfileirados: 3 }) // todos abaixo do teto de 2 (metade tem 0 vivos)
    // agora: cheio=2 vivos, novo=2 vivos, metade=1 vivo (da c2)
    const c3 = await disparar()
    expect(c3.body).toMatchObject({ status: 'enfileirada', enfileirados: 1, total_destinatarios: 1 })

    const linhas = await poolSuper.query(
      `select ce.cliente_id, ce.status::text as status, ce.envio_id, e.status::text as envio_status
         from public.campanha_envios ce left join public.envios e on e.id = ce.envio_id
        where ce.campanha_id = $1`,
      [c3.id],
    )
    const por = Object.fromEntries(linhas.rows.map((x: Reg) => [x.cliente_id, x]))
    expect(por[metade]).toMatchObject({ status: 'enfileirado', envio_status: 'agendado' })
    for (const sup of [cheio, novo]) {
      expect(por[sup].status).toBe('suprimido_frequencia')
      expect(por[sup].envio_id).toBeNull() // nada na outbox: suprimido, nao falha
    }
    const fora = await poolSuper.query(
      `select count(*)::int as n from public.envios where loja_id = $1 and cliente_id = any($2)
        and dedupe_chave = $3`,
      [lojaC, [cheio, novo], `campanha:${c3.id}:${cheio}`],
    )
    expect(fora.rows[0].n).toBe(0)
    // resumo de entrega nao conta suprimido como falha
    const det = await chamar(donoC, lojaC, 'GET', `/${c3.id}`)
    expect(det.json().entrega).toMatchObject({ enfileirados: 1, falhas: 0 })
    // auditoria registra o total suprimido (sem PII)
    const ev = await poolSuper.query(
      `select detalhes from public.eventos where loja_id = $1 and tipo = 'campanha.disparada'
        and entidade_id = $2`, [lojaC, c3.id],
    )
    expect(ev.rows[0].detalhes).toMatchObject({ total: 1, suprimidos_frequencia: 2 })
  })

  it('limite de frequencia e por loja+cliente: nao vaza entre lojas e e configuravel', async () => {
    // Mesmo telefone_hash em duas lojas = mesmo consumidor, mas contagem e por loja.
    const h = hash('consumidor-compartilhado')
    const cA = randomUUID(), cC = randomUUID()
    await poolSuper.query(
      'insert into public.clientes (id, loja_id, telefone_hash, nome) values ($1,$2,$3,$4),($5,$6,$3,$7)',
      [cA, lojaA, h, 'Compart A', cC, lojaC, 'Compart C'],
    )
    // Loja A (limite desligado) manda uma campanha: nao pode consumir o teto do cliente da loja C.
    const ca = await criarCamp(lojaA, { filtro: {} })
    await dispararC(lojaA, dono, ca.json().id)
    await poolSuper.query(
      'update public.lojas set campanha_freq_max = 1, campanha_freq_janela_dias = 7 where id = $1', [lojaC],
    )
    const mk = async () => {
      const r = await chamar(donoC, lojaC, 'POST', '/', {
        nome: 'Iso', template_chave: 'camp.promo', numero_whatsapp_id: numeroC, filtro: {}, variaveis: { cupom: 'X' },
      })
      return r.json().id as string
    }
    const estado = async (id: string) => (await poolSuper.query(
      'select status::text as s from public.campanha_envios where campanha_id = $1 and cliente_id = $2', [id, cC],
    )).rows[0]?.s
    // campanhas previas da loja C ja consumiram o teto de quem existia; o cliente cC e novo na loja C
    // (so recebeu a campanha da loja A, que nao conta): 1a campanha da C entrega, a 2a suprime.
    const i1 = await mk()
    await dispararC(lojaC, donoC, i1)
    expect(await estado(i1)).toBe('enfileirado')
    const i2 = await mk()
    await dispararC(lojaC, donoC, i2)
    expect(await estado(i2)).toBe('suprimido_frequencia')
    // configuravel: sem limite (null) volta a enfileirar
    await poolSuper.query('update public.lojas set campanha_freq_max = null where id = $1', [lojaC])
    const i3 = await mk()
    await dispararC(lojaC, donoC, i3)
    expect(await estado(i3)).toBe('enfileirado')
    // janela: envios fora da janela nao contam
    await poolSuper.query(
      'update public.lojas set campanha_freq_max = 1, campanha_freq_janela_dias = 1 where id = $1', [lojaC],
    )
    await poolSuper.query(
      `update public.campanha_envios set criado_em = now() - interval '3 days' where loja_id = $1`, [lojaC],
    )
    const i4 = await mk()
    await dispararC(lojaC, donoC, i4)
    expect(await estado(i4)).toBe('enfileirado')
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
