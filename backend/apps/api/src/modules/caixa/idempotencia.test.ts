// Idempotencia do lancamento de caixa (PDV): reenvio da MESMA chave_idempotencia (duplo-clique/
// retry) e no-op. Mesmo movimento devolvido, nenhuma 2a linha, nenhum 2o evento de auditoria, e o
// relatorio conta o valor UMA vez. Controle: movimentos sem chave criam linhas separadas (dedup e
// escopada a chave, nao e geral). Roda no Postgres local (role whaviso_api); ver caixa/crud.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Writable } from 'node:stream'
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
if (!online) console.warn('[caixa/idempotencia] banco inacessivel: integracao PULADA.')

const logs: string[] = []
const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('caixa-idem-teste', 'info', destino),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'caixa', plugin: criarCaixaRoutes() }],
  })
  await app.ready()
  return app
}

d('modulo caixa (idempotencia por chave)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let dono: string, loja: string
  let caixaId = ''

  const chamar = (metodo: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/caixa${url}`,
      headers: { authorization: `Bearer ${dono}`, 'x-loja-id': loja },
      payload: payload as object | undefined,
    })

  const mv = (b: object) => chamar('POST', `/${caixaId}/movimentos`, b)

  const contarLinhas = async () => {
    const { rows } = await poolSuper.query<{ n: number }>(
      'select count(*)::int as n from public.movimentos_caixa where caixa_id = $1', [caixaId])
    return rows[0]!.n
  }

  beforeAll(async () => {
    dono = await criarUsuario(cen)
    const conta = await criarConta(cen, dono)
    loja = await criarLoja(conta)
    lojas.push(loja)
    await criarMembro(conta, dono, 'dono', null)
    app = await montar()
    const abre = await chamar('POST', '/abrir', { saldo_inicial_centavos: 0 })
    expect(abre.statusCode, abre.body).toBe(201)
    caixaId = abre.json().id
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojas) {
      await poolSuper.query('delete from public.movimentos_caixa where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.caixas where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  it('venda com a mesma chave duas vezes: mesmo movimento, sem 2a linha, sem 2o evento', async () => {
    const corpo = { tipo: 'venda', forma_pagamento: 'dinheiro', valor_centavos: 3000, chave_idempotencia: 'cx-venda-1' }
    const r1 = await mv(corpo)
    expect(r1.statusCode, r1.body).toBe(201)
    const r2 = await mv(corpo)
    expect(r2.statusCode, r2.body).toBe(201)
    expect(r2.json().id).toBe(r1.json().id)

    expect(await contarLinhas()).toBe(1)
    const { rows } = await poolSuper.query<{ n: number }>(
      `select count(*)::int as n from public.eventos
        where entidade_id = $1 and tipo = 'caixa.movimento'`, [r1.json().id])
    expect(rows[0]!.n).toBe(1)

    const rel = (await chamar('GET', `/${caixaId}/relatorio`)).json()
    expect(rel.totais_por_forma.dinheiro).toBe(3000)
    expect(rel.total_vendas_centavos).toBe(3000)
    expect(rel.qtd_movimentos).toBe(1)
    expect(rel.movimentos).toHaveLength(1)
    expect(rel.saldo_esperado_dinheiro_centavos).toBe(3000)
  })

  it('sangria com a mesma chave duas vezes: no-op; total conta uma vez', async () => {
    const corpo = { tipo: 'sangria', valor_centavos: 1000, motivo: 'troco', chave_idempotencia: 'cx-sangria-1' }
    const r1 = await mv(corpo)
    expect(r1.statusCode, r1.body).toBe(201)
    const r2 = await mv(corpo)
    expect(r2.json().id).toBe(r1.json().id)

    expect(await contarLinhas()).toBe(2) // venda anterior + esta sangria
    const rel = (await chamar('GET', `/${caixaId}/relatorio`)).json()
    expect(rel.total_sangrias_centavos).toBe(1000)
    expect(rel.qtd_movimentos).toBe(2)
    // 3000 (venda dinheiro) - 1000 (sangria) = 2000.
    expect(rel.saldo_esperado_dinheiro_centavos).toBe(2000)
  })

  it('controle: dois movimentos SEM chave criam duas linhas (dedup e escopada a chave)', async () => {
    const corpo = { tipo: 'venda', forma_pagamento: 'pix', valor_centavos: 500 }
    const a = await mv(corpo)
    const b = await mv(corpo)
    expect(a.statusCode, a.body).toBe(201)
    expect(b.statusCode, b.body).toBe(201)
    expect(b.json().id).not.toBe(a.json().id)

    expect(await contarLinhas()).toBe(4) // venda + sangria + 2 vendas pix
    const rel = (await chamar('GET', `/${caixaId}/relatorio`)).json()
    expect(rel.totais_por_forma.pix).toBe(1000)
    expect(rel.qtd_movimentos).toBe(4)
  })

  it('controle: chaves DIFERENTES criam duas linhas', async () => {
    const r1 = await mv({ tipo: 'suprimento', valor_centavos: 200, chave_idempotencia: 'cx-sup-a' })
    const r2 = await mv({ tipo: 'suprimento', valor_centavos: 200, chave_idempotencia: 'cx-sup-b' })
    expect(r1.statusCode, r1.body).toBe(201)
    expect(r2.statusCode, r2.body).toBe(201)
    expect(r2.json().id).not.toBe(r1.json().id)

    expect(await contarLinhas()).toBe(6)
    const rel = (await chamar('GET', `/${caixaId}/relatorio`)).json()
    expect(rel.total_suprimentos_centavos).toBe(400)
    expect(rel.qtd_movimentos).toBe(6)
  })
})
