// Seguranca do modulo ficha_tecnica: isolamento multi-tenant (SEC-001/002) via app HTTP e os
// grants de role em public.fichas_tecnicas (whaviso_api sem DELETE; whaviso_atendente so SELECT).
// Depende da 0027 (fichas_tecnicas) e da 0026 (insumos): pula se ausentes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import { criarPool } from '../../../../../test-support/banco'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar, novoCenario, poolApi,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { fichaTecnicaRoutes } from './routes'
import { criarItem, limparFichaEstoque, montarInsercaoInsumo, tabelaExiste } from './fixtures'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const temFichas = online && (await tabelaExiste('fichas_tecnicas'))
const insumo = online && temFichas ? await montarInsercaoInsumo() : { inserivel: false, motivo: 'banco/0027 ausente', criar: async () => '' }
const pronto = online && temFichas && insumo.inserivel
if (!pronto) console.warn('[ficha_tecnica/seguranca] PULADA: aplicar 0026+0027 no banco de teste.')

const d = pronto ? describe : describe.skip

const poolAtendente = criarPool('whaviso_atendente', 'whaviso_atendente_dev', 2)

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('ficha-seg-teste', 'info'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'ficha-tecnica', plugin: fichaTecnicaRoutes }],
  })
  await app.ready()
  return app
}

d('modulo ficha_tecnica: seguranca (integracao)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let donoA = '', donoB = ''
  let lojaA = '', lojaB = '', itemA = '', insumoA = '', fichaIdA = ''

  const chamar = (user: string, loja: string, metodo: 'GET' | 'PUT', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/ficha-tecnica${url}`,
      headers: { authorization: `Bearer ${user}`, 'x-loja-id': loja },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    lojas.push(lojaA, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaB, donoB, 'dono', null)
    itemA = await criarItem(lojaA)
    insumoA = await insumo.criar(lojaA, 100)
    app = await montar()
    await chamar(donoA, lojaA, 'PUT', `/itens/${itemA}`, { linhas: [{ insumo_id: insumoA, quantidade: 1 }] })
    const { rows } = await poolApi.query<{ id: string }>(
      'select id from public.fichas_tecnicas where loja_id = $1 limit 1', [lojaA],
    )
    fichaIdA = rows[0]!.id
  })

  afterAll(async () => {
    await app.close()
    await poolAtendente.end().catch(() => {})
    for (const l of lojas) await limparFichaEstoque(l)
    await limpar(cen)
    await fecharPools()
  })

  it('SEC-001: loja B nao le nem edita a ficha do item da loja A (404)', async () => {
    expect((await chamar(donoB, lojaB, 'GET', `/itens/${itemA}`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'PUT', `/itens/${itemA}`, { linhas: [] })).statusCode).toBe(404)
  })

  it('SEC-002: x-loja-id de outra conta = 404; loja_id no corpo e rejeitado (400)', async () => {
    expect((await chamar(donoB, lojaA, 'GET', `/itens/${itemA}`)).statusCode).toBe(404)
    const extra = await chamar(donoA, lojaA, 'PUT', `/itens/${itemA}`, { linhas: [], loja_id: lojaB })
    expect(extra.statusCode).toBe(400)
  })

  it('sem autenticacao: 401; itemId malformado: 400', async () => {
    const semAuth = await app.inject({ method: 'GET', url: `/v1/ficha-tecnica/itens/${itemA}` })
    expect(semAuth.statusCode).toBe(401)
    expect((await chamar(donoA, lojaA, 'GET', '/itens/nao-e-uuid')).statusCode).toBe(400)
  })

  it('SEC-030: whaviso_api NAO tem DELETE em fichas_tecnicas', async () => {
    await expect(
      poolApi.query('delete from public.fichas_tecnicas where id = $1', [fichaIdA]),
    ).rejects.toThrow()
  })

  it('whaviso_atendente LE a ficha mas nao escreve (SELECT sim; INSERT/UPDATE/DELETE nao)', async () => {
    const sel = await poolAtendente.query('select id, quantidade from public.fichas_tecnicas where id = $1', [fichaIdA])
    expect(sel.rows).toHaveLength(1)
    await expect(
      poolAtendente.query(
        `insert into public.fichas_tecnicas (loja_id, item_id, insumo_id, quantidade) values ($1,$2,$3,1)`,
        [lojaA, itemA, insumoA],
      ),
    ).rejects.toThrow()
    await expect(
      poolAtendente.query('update public.fichas_tecnicas set quantidade = 9 where id = $1', [fichaIdA]),
    ).rejects.toThrow()
    await expect(
      poolAtendente.query('delete from public.fichas_tecnicas where id = $1', [fichaIdA]),
    ).rejects.toThrow()
  })

  it('id de ficha inexistente nao vaza: GET de item inexistente = 404', async () => {
    expect((await chamar(donoA, lojaA, 'GET', `/itens/${randomUUID()}`)).statusCode).toBe(404)
  })
})
