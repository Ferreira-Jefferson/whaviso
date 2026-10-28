// Corrida (concorrencia) do modulo caixa: duas ou mais requisicoes sobrepostas disparadas no mesmo
// instante (Promise.all sobre app.inject, cada inject com sua propria conexao/transacao). Prova que
// a guarda segura: (1) abrir caixa sob o indice parcial unico `caixas_uma_aberta_por_loja` deixa
// UMA sessao aberta e a outra recebe 409 caixa_ja_aberto; (2) lancamento com a MESMA
// chave_idempotencia em paralelo e no-op (mesmo id, uma linha so). Roda no Postgres local
// (role whaviso_api); ver caixa/crud.test.ts e caixa/idempotencia.test.ts.
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
if (!online) console.warn('[caixa/corrida] banco inacessivel: integracao PULADA.')

const logs: string[] = []
const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('caixa-corrida-teste', 'info', destino),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'caixa', plugin: criarCaixaRoutes() }],
  })
  await app.ready()
  return app
}

d('modulo caixa (corrida)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let dono: string, loja: string

  const chamar = (metodo: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/caixa${url}`,
      headers: { authorization: `Bearer ${dono}`, 'x-loja-id': loja },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    dono = await criarUsuario(cen)
    const conta = await criarConta(cen, dono)
    loja = await criarLoja(conta)
    lojas.push(loja)
    await criarMembro(conta, dono, 'dono', null)
    app = await montar()
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

  it('duas aberturas simultaneas: exatamente uma 201 e a outra 409 caixa_ja_aberto', async () => {
    const rs = await Promise.all([
      chamar('POST', '/abrir', { saldo_inicial_centavos: 1000 }),
      chamar('POST', '/abrir', { saldo_inicial_centavos: 2000 }),
    ])
    const abertos = rs.filter((r) => r.statusCode === 201)
    const barrados = rs.filter((r) => r.statusCode === 409)
    expect(abertos).toHaveLength(1)
    expect(barrados).toHaveLength(1)
    expect(barrados[0]!.json().error.code).toBe('caixa_ja_aberto')
    // No banco, so UMA sessao aberta existe.
    const { rows } = await poolSuper.query<{ n: number }>(
      `select count(*)::int as n from public.caixas where loja_id = $1 and status = 'aberto'`, [loja])
    expect(rows[0]!.n).toBe(1)
  })

  it('lancamento com a MESMA chave em paralelo: mesmo id, uma linha so', async () => {
    const caixaId = (await chamar('GET', '/aberto')).json().caixa.id as string
    const corpo = { tipo: 'venda', forma_pagamento: 'dinheiro', valor_centavos: 3000, chave_idempotencia: 'cx-corrida-1' }
    const rs = await Promise.all([
      chamar('POST', `/${caixaId}/movimentos`, corpo),
      chamar('POST', `/${caixaId}/movimentos`, corpo),
    ])
    expect(rs.map((r) => r.statusCode)).toEqual([201, 201])
    const ids = rs.map((r) => r.json().id as string)
    expect(ids[0]).toBe(ids[1])
    // Uma unica linha com essa chave e um unico evento de auditoria.
    const { rows } = await poolSuper.query<{ n: number }>(
      'select count(*)::int as n from public.movimentos_caixa where loja_id = $1 and chave_idempotencia = $2',
      [loja, 'cx-corrida-1'])
    expect(rows[0]!.n).toBe(1)
    const ev = await poolSuper.query<{ n: number }>(
      `select count(*)::int as n from public.eventos where entidade_id = $1 and tipo = 'caixa.movimento'`, [ids[0]])
    expect(ev.rows[0]!.n).toBe(1)
    // O relatorio conta o valor uma vez.
    const rel = (await chamar('GET', `/${caixaId}/relatorio`)).json()
    expect(rel.total_vendas_centavos).toBe(3000)
  })
})
