// Integracao do modulo crm contra o Postgres local (role whaviso_api).
// Cobre RFM/segmentos, historico, o que compram, opt-out (primeira classe), RBAC,
// isolamento multi-tenant e ausencia de PII.
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
import { crmRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[crm] banco inacessivel: integracao PULADA.')

const logs: string[] = []
const destino = new Writable({
  write(chunk: Buffer, _enc, cb) {
    logs.push(chunk.toString('utf8'))
    cb()
  },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reg = Record<string, any> // linha JSON de resposta (teste)

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

d('modulo crm (integracao)', () => {
  const cen = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let dono: string, atend: string, donoB: string
  let lojaA: string, lojaB: string
  // clientes de A
  let campeao = '', novo = '', perdido = '', semPedido = '', clienteB = ''

  const chamar = (user: string, loja: string | null, metodo: 'GET' | 'PUT', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/crm${url}`,
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
  let seq = 0
  async function pedido(loja: string, cli: string, status: string, total: number, diasAtras: number, item?: string) {
    const id = randomUUID()
    await poolSuper.query(
      `insert into public.pedidos (id, loja_id, cliente_id, codigo, status, subtotal_centavos, total_centavos,
                                   modalidade, criado_em, entregue_em)
       values ($1,$2,$3,$4,$5::status_pedido,$6,$6,'retirada', now() - make_interval(days => $7),
               case when $5 = 'entregue' then now() - make_interval(days => $7) end)`,
      [id, loja, cli, `T${++seq}`, status, total, diasAtras],
    )
    if (item) {
      await poolSuper.query(
        `insert into public.itens_pedido (pedido_id, loja_id, nome_snapshot, preco_unitario_centavos, quantidade, total_centavos)
         values ($1,$2,$3,$4,2,$5)`,
        [id, loja, item, total / 2, total],
      )
    }
  }

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

    campeao = await cliente(lojaA, 'Campeao')
    for (let i = 0; i < 6; i++) await pedido(lojaA, campeao, 'entregue', 10000, i + 1, 'Burger')
    novo = await cliente(lojaA, 'Novo')
    await pedido(lojaA, novo, 'entregue', 3000, 5, 'Suco')
    perdido = await cliente(lojaA, 'Perdido')
    await pedido(lojaA, perdido, 'entregue', 2000, 120, 'Burger')
    semPedido = await cliente(lojaA, 'SemPedido')
    await pedido(lojaA, semPedido, 'rascunho', 9999, 1) // nao conta (so entregue)
    await pedido(lojaA, semPedido, 'novo', 9999, 1) // nao conta (so entregue)
    clienteB = await cliente(lojaB, 'ClienteB')
    await pedido(lojaB, clienteB, 'entregue', 5000, 2, 'Pizza')

    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('crm-teste', 'info', destino),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'crm', plugin: crmRoutes }],
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

  it('lista com RFM: segmentos e notas corretos; so pedido entregue conta', async () => {
    const r = await chamar(dono, lojaA, 'GET', '/clientes')
    expect(r.statusCode, r.body).toBe(200)
    const por = new Map<string, Reg>(r.json().itens.map((i: Reg) => [i.cliente_id, i]))
    expect(por.size).toBe(4)
    expect(por.get(campeao)).toMatchObject({
      segmento: 'campeao', pedidos_total: 6, gasto_total_centavos: 60000, ticket_medio_centavos: 10000,
      pedidos_180d: 6, gasto_180d_centavos: 60000, nota_r: 5, nota_f: 4, nota_m: 5, recencia_dias: 1,
    })
    expect(por.get(novo)).toMatchObject({ segmento: 'novo', nota_r: 5, nota_f: 1 })
    expect(por.get(perdido)).toMatchObject({ segmento: 'perdido', nota_r: 1, pedidos_180d: 1 })
    expect(por.get(semPedido)).toMatchObject({
      segmento: 'sem_pedido', pedidos_total: 0, gasto_total_centavos: 0, nota_r: null, recencia_dias: null,
    })
    // ordenado por gasto total desc
    expect(r.json().itens[0].cliente_id).toBe(campeao)
  })

  it('filtra por segmento e pagina por cursor sem repetir', async () => {
    const f = await chamar(dono, lojaA, 'GET', '/clientes?segmento=perdido')
    expect(f.json().itens.map((i: Reg) => i.cliente_id)).toEqual([perdido])
    const p1 = await chamar(dono, lojaA, 'GET', '/clientes?limite=2')
    expect(p1.json().itens).toHaveLength(2)
    expect(p1.json().proximoCursor).toBeTruthy()
    const p2 = await chamar(dono, lojaA, 'GET', `/clientes?limite=2&cursor=${p1.json().proximoCursor}`)
    const ids = [...p1.json().itens, ...p2.json().itens].map((i: Reg) => i.cliente_id)
    expect(new Set(ids).size).toBe(4)
    expect(p2.json().proximoCursor).toBeNull()
    const ruim = await chamar(dono, lojaA, 'GET', '/clientes?cursor=lixo')
    expect(ruim.statusCode).toBe(400)
    expect(ruim.json().error.code).toBe('cursor_invalido')
  })

  it('resumo traz todos os segmentos (zerados incluidos)', async () => {
    const r = await chamar(dono, lojaA, 'GET', '/resumo')
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.clientes_total).toBe(4)
    expect(j.segmentos.map((s: Reg) => s.segmento)).toEqual(
      ['campeao', 'fiel', 'em_risco', 'novo', 'ocasional', 'perdido', 'sem_pedido'],
    )
    expect(j.segmentos.find((s: Reg) => s.segmento === 'fiel').clientes).toBe(0)
    expect(j.segmentos.find((s: Reg) => s.segmento === 'campeao').gasto_180d_centavos).toBe(60000)
  })

  it('o que compram: itens mais vendidos na janela (so entregues)', async () => {
    const r = await chamar(dono, lojaA, 'GET', '/itens?dias=90')
    expect(r.statusCode).toBe(200)
    const burger = r.json().itens.find((i: Reg) => i.nome === 'Burger')
    // 6 pedidos do campeao x 2 un (o pedido perdido, de 120 dias, fica fora da janela de 90)
    expect(burger).toMatchObject({ quantidade: 12, clientes: 1, faturamento_centavos: 60000 })
    expect(r.json().itens.some((i: Reg) => i.nome === 'Pizza')).toBe(false) // outra loja
  })

  it('ficha do cliente: metricas, favoritos, historico sem rascunho, consentimento padrao', async () => {
    const r = await chamar(dono, lojaA, 'GET', `/clientes/${semPedido}`)
    expect(r.statusCode).toBe(200)
    expect(r.json().ultimos_pedidos).toHaveLength(1) // so o 'novo'; rascunho fora
    expect(r.json().consentimento).toMatchObject({ opt_out_marketing: false, origem: null })
    const c = await chamar(dono, lojaA, 'GET', `/clientes/${campeao}`)
    expect(c.json().itens_favoritos[0]).toMatchObject({ nome: 'Burger', quantidade: 12 })
    expect(c.json().metricas.segmento).toBe('campeao')
  })

  it('opt-out: registra, audita sem PII, reflete na lista/filtro e reverte (idempotente)', async () => {
    const r = await chamar(atend, lojaA, 'PUT', `/clientes/${novo}/consentimento`, {
      opt_out_marketing: true, motivo: 'pediu para parar', origem: 'cliente_whatsapp',
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ opt_out_marketing: true, origem: 'cliente_whatsapp', motivo: 'pediu para parar' })
    expect(r.json().opt_out_em).toBeTruthy()
    // idempotente
    const r2 = await chamar(dono, lojaA, 'PUT', `/clientes/${novo}/consentimento`, { opt_out_marketing: true })
    expect(r2.statusCode).toBe(200)
    const nao = await chamar(dono, lojaA, 'GET', '/clientes?contactavel=true')
    expect(nao.json().itens.map((i: Reg) => i.cliente_id)).not.toContain(novo)
    const sim = await chamar(dono, lojaA, 'GET', '/clientes?contactavel=false')
    expect(sim.json().itens.map((i: Reg) => i.cliente_id)).toEqual([novo])
    expect((await chamar(dono, lojaA, 'GET', '/resumo')).json().opt_out_total).toBe(1)
    const ev = await poolSuper.query(
      `select detalhes::text as t from public.eventos where loja_id = $1 and tipo = 'cliente.consentimento_alterado'`,
      [lojaA],
    )
    expect(ev.rows.length).toBeGreaterThanOrEqual(2)
    for (const l of ev.rows) expect(l.t).not.toMatch(/pediu|telefone|nome/i)
    // reverte
    const rev = await chamar(dono, lojaA, 'PUT', `/clientes/${novo}/consentimento`, { opt_out_marketing: false })
    expect(rev.json()).toMatchObject({ opt_out_marketing: false })
    expect(rev.json().opt_in_em).toBeTruthy()
    expect(rev.json().opt_out_em).toBeTruthy() // historico do ultimo opt-out preservado
  })

  it('RBAC: atendente nao le metricas (403) mas registra opt-out; sem x-loja-id recusado', async () => {
    expect((await chamar(atend, lojaA, 'GET', '/clientes')).statusCode).toBe(403)
    expect((await chamar(atend, lojaA, 'GET', '/resumo')).statusCode).toBe(403)
    expect((await chamar(dono, null, 'GET', '/resumo')).statusCode).toBeGreaterThanOrEqual(400)
  })

  it('isolamento multi-tenant: loja B nao ve nem altera clientes da A', async () => {
    const lista = await chamar(donoB, lojaB, 'GET', '/clientes')
    expect(lista.json().itens.map((i: Reg) => i.cliente_id)).toEqual([clienteB])
    expect((await chamar(donoB, lojaB, 'GET', `/clientes/${campeao}`)).statusCode).toBe(404)
    const put = await chamar(donoB, lojaB, 'PUT', `/clientes/${campeao}/consentimento`, { opt_out_marketing: true })
    expect(put.statusCode).toBe(404)
    expect((await chamar(donoB, lojaA, 'GET', '/clientes')).statusCode).toBeGreaterThanOrEqual(403)
    const n = await poolSuper.query('select count(*)::int as n from public.cliente_consentimento where cliente_id = $1', [campeao])
    expect(n.rows[0].n).toBe(0)
  })

  it('validacao: corpo com campo extra e 400; erro no envelope; sem PII nas respostas', async () => {
    const r = await chamar(dono, lojaA, 'PUT', `/clientes/${novo}/consentimento`, { opt_out_marketing: true, loja_id: lojaB })
    expect(r.statusCode).toBe(400)
    const ok = await chamar(dono, lojaA, 'GET', `/clientes/${campeao}`)
    expect(ok.body).not.toMatch(/telefone/)
    const nf = await chamar(dono, lojaA, 'GET', `/clientes/${randomUUID()}`)
    expect(nf.statusCode).toBe(404)
    expect(nf.json()).toHaveProperty('error.code')
  })
})
