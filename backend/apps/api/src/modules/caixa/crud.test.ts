// Integracao do modulo caixa contra o Postgres local (role whaviso_api).
// Cobre abrir/mover/fechar com calculo de saldo, relatorio por forma de pagamento e validacoes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar, novoCenario, poolApi, poolSuper,
} from '../../../test/db'
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
if (!online) console.warn('[caixa] banco inacessivel: integracao PULADA.')

const logs: string[] = []
const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('caixa-teste', 'info', destino),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'caixa', plugin: criarCaixaRoutes() }],
  })
  await app.ready()
  return app
}

d('modulo caixa (integracao)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let dono: string, loja: string, pedidoId: string

  const chamar = (user: string, lj: string | null, metodo: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/caixa${url}`,
      headers: { authorization: `Bearer ${user}`, ...(lj ? { 'x-loja-id': lj } : {}) },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    dono = await criarUsuario(cen)
    const conta = await criarConta(cen, dono)
    loja = await criarLoja(conta)
    lojas.push(loja)
    await criarMembro(conta, dono, 'dono', null)
    const r = await poolSuper.query<{ id: string }>(
      `insert into public.pedidos (loja_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1, 'C1', 'entregue', 3000, 3000) returning id`,
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

  let caixaId = ''

  it('abre caixa: 201, status aberto, saldo inicial, auditoria caixa.aberto', async () => {
    const r = await chamar(dono, loja, 'POST', '/abrir', { saldo_inicial_centavos: 10000 })
    expect(r.statusCode, r.body).toBe(201)
    const c = r.json()
    caixaId = c.id
    expect(c).toMatchObject({ status: 'aberto', saldo_inicial_centavos: 10000, saldo_calculado_centavos: null })
    expect(c.aberto_em).toMatch(/Z$/)
    const { rows } = await poolSuper.query(
      `select tipo from public.eventos where loja_id = $1 and tipo = 'caixa.aberto'`, [loja])
    expect(rows).toHaveLength(1)
  })

  it('dois caixas abertos ao mesmo tempo: 409 caixa_ja_aberto', async () => {
    const r = await chamar(dono, loja, 'POST', '/abrir', { saldo_inicial_centavos: 0 })
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('caixa_ja_aberto')
  })

  it('GET /aberto devolve a sessao corrente', async () => {
    const r = await chamar(dono, loja, 'GET', '/aberto')
    expect(r.statusCode).toBe(200)
    expect(r.json().caixa.id).toBe(caixaId)
  })

  it('registra venda/suprimento/sangria/ajuste; venda pode vincular pedido', async () => {
    const mv = (b: object) => chamar(dono, loja, 'POST', `/${caixaId}/movimentos`, b)
    expect((await mv({ tipo: 'venda', forma_pagamento: 'dinheiro', valor_centavos: 3000, pedido_id: pedidoId })).statusCode).toBe(201)
    expect((await mv({ tipo: 'venda', forma_pagamento: 'credito', valor_centavos: 2000 })).statusCode).toBe(201)
    expect((await mv({ tipo: 'venda', forma_pagamento: 'pix', valor_centavos: 1500 })).statusCode).toBe(201)
    expect((await mv({ tipo: 'suprimento', valor_centavos: 5000 })).statusCode).toBe(201)
    expect((await mv({ tipo: 'sangria', valor_centavos: 4000, motivo: 'troco' })).statusCode).toBe(201)
    const aj = await mv({ tipo: 'ajuste', valor_centavos: -500, motivo: 'quebra de caixa' })
    expect(aj.statusCode, aj.body).toBe(201)
    expect(aj.json().valor_centavos).toBe(-500)
  })

  it('validacoes: venda sem forma, forma em nao-venda, ajuste sem motivo, valor <= 0, pedido de fora', async () => {
    const mv = (b: object) => chamar(dono, loja, 'POST', `/${caixaId}/movimentos`, b)
    expect((await mv({ tipo: 'venda', valor_centavos: 100 })).json().error.code).toBe('forma_obrigatoria')
    expect((await mv({ tipo: 'suprimento', forma_pagamento: 'pix', valor_centavos: 100 })).json().error.code).toBe('forma_nao_aplicavel')
    expect((await mv({ tipo: 'ajuste', valor_centavos: 100 })).json().error.code).toBe('motivo_obrigatorio')
    // valor <= 0 passa pelo Zod (0 e inteiro valido) e e barrado como REGRA DE NEGOCIO (422), nao shape (400).
    const v0 = await mv({ tipo: 'venda', forma_pagamento: 'dinheiro', valor_centavos: 0 })
    expect(v0.statusCode).toBe(422)
    expect(v0.json().error.code).toBe('valor_invalido')
    expect((await mv({ tipo: 'sangria', valor_centavos: -5 })).json().error.code).toBe('valor_invalido')
    const forac = await mv({ tipo: 'venda', forma_pagamento: 'dinheiro', valor_centavos: 100, pedido_id: randomUUID() })
    expect(forac.statusCode).toBe(404)
  })

  it('relatorio: totais por forma e saldo esperado em dinheiro', async () => {
    const r = await chamar(dono, loja, 'GET', `/${caixaId}/relatorio`)
    expect(r.statusCode).toBe(200)
    const rel = r.json()
    expect(rel.totais_por_forma).toMatchObject({ dinheiro: 3000, credito: 2000, pix: 1500, debito: 0, outro: 0 })
    expect(rel.total_vendas_centavos).toBe(6500)
    expect(rel.total_suprimentos_centavos).toBe(5000)
    expect(rel.total_sangrias_centavos).toBe(4000)
    expect(rel.total_ajustes_centavos).toBe(-500)
    // 10000 + 5000 (suprimento) + 3000 (venda dinheiro) - 4000 (sangria) = 14000
    expect(rel.saldo_esperado_dinheiro_centavos).toBe(14000)
    expect(rel.qtd_movimentos).toBe(6)
    expect(rel.movimentos).toHaveLength(6)
  })

  it('fecha caixa: calcula saldo e diferenca vs informado; auditoria caixa.fechado', async () => {
    const r = await chamar(dono, loja, 'POST', `/${caixaId}/fechar`, { saldo_informado_centavos: 13950, observacoes: 'faltou 50' })
    expect(r.statusCode, r.body).toBe(200)
    const c = r.json()
    expect(c).toMatchObject({
      status: 'fechado', saldo_calculado_centavos: 14000, saldo_informado_centavos: 13950, diferenca_centavos: -50,
    })
    expect(c.fechado_em).toMatch(/Z$/)
    const { rows } = await poolSuper.query(
      `select tipo from public.eventos where loja_id = $1 and tipo = 'caixa.fechado'`, [loja])
    expect(rows).toHaveLength(1)
  })

  it('caixa fechado: movimento e novo fechamento sao recusados (409)', async () => {
    const mov = await chamar(dono, loja, 'POST', `/${caixaId}/movimentos`, { tipo: 'suprimento', valor_centavos: 100 })
    expect(mov.statusCode).toBe(409)
    expect(mov.json().error.code).toBe('caixa_fechado')
    const fech = await chamar(dono, loja, 'POST', `/${caixaId}/fechar`, { saldo_informado_centavos: 0 })
    expect(fech.statusCode).toBe(409)
  })

  it('apos fechar, GET /aberto volta nulo e e possivel abrir de novo', async () => {
    expect((await chamar(dono, loja, 'GET', '/aberto')).json().caixa).toBeNull()
    const r = await chamar(dono, loja, 'POST', '/abrir', { saldo_inicial_centavos: 0 })
    expect(r.statusCode).toBe(201)
    expect(r.json().id).not.toBe(caixaId)
  })

  it('caixa inexistente: 404; id malformado: 400', async () => {
    expect((await chamar(dono, loja, 'GET', `/${randomUUID()}/relatorio`)).statusCode).toBe(404)
    expect((await chamar(dono, loja, 'GET', '/nao-e-uuid/relatorio')).statusCode).toBe(400)
  })
})
