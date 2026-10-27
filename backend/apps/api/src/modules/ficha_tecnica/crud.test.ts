// Integracao do modulo ficha_tecnica (role whaviso_api, via app HTTP). CRUD da ficha de um item.
// Depende da 0027 (fichas_tecnicas) e da 0026 (insumos): se o banco de teste ainda nao tiver essas
// tabelas, a suite se pula (o modulo roda apos a integracao dessas migrations).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
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
if (!online) console.warn('[ficha_tecnica/crud] banco inacessivel: integracao PULADA.')
else if (!pronto) console.warn(`[ficha_tecnica/crud] PULADA: ${temFichas ? insumo.motivo : 'tabela fichas_tecnicas ausente (aplicar 0026+0027)'}`)

const d = pronto ? describe : describe.skip

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('ficha-crud-teste', 'info'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'ficha-tecnica', plugin: fichaTecnicaRoutes }],
  })
  await app.ready()
  return app
}

d('modulo ficha_tecnica: CRUD (integracao)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let dono = '', atendente = ''
  let loja = '', itemId = '', insumoA = '', insumoB = '', insumoC = ''

  const chamar = (user: string, metodo: 'GET' | 'PUT', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/ficha-tecnica${url}`,
      headers: { authorization: `Bearer ${user}`, 'x-loja-id': loja },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    dono = await criarUsuario(cen)
    atendente = await criarUsuario(cen)
    const conta = await criarConta(cen, dono)
    loja = await criarLoja(conta)
    lojas.push(loja)
    await criarMembro(conta, dono, 'dono', null)
    await criarMembro(conta, atendente, 'atendente', loja)
    itemId = await criarItem(loja)
    insumoA = await insumo.criar(loja, 100)
    insumoB = await insumo.criar(loja, 100)
    insumoC = await insumo.criar(loja, 100)
    app = await montar()
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojas) await limparFichaEstoque(l)
    await limpar(cen)
    await fecharPools()
  })

  it('ficha vazia quando nunca definida', async () => {
    const r = await chamar(dono, 'GET', `/itens/${itemId}`)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ item_id: itemId, linhas: [] })
  })

  it('PUT define a ficha (upsert) e GET devolve as linhas', async () => {
    const r = await chamar(dono, 'PUT', `/itens/${itemId}`, {
      linhas: [
        { insumo_id: insumoA, quantidade: 0.25 },
        { insumo_id: insumoB, quantidade: 2 },
      ],
    })
    expect(r.statusCode).toBe(200)
    const corpo = r.json()
    expect(corpo.item_id).toBe(itemId)
    expect(corpo.linhas).toHaveLength(2)
    const mapa = Object.fromEntries(corpo.linhas.map((l: { insumo_id: string; quantidade: number }) => [l.insumo_id, l.quantidade]))
    expect(mapa[insumoA]).toBeCloseTo(0.25, 3)
    expect(mapa[insumoB]).toBeCloseTo(2, 3)
  })

  it('PUT substitui a ficha: troca quantidade, remove (logico) o que saiu, adiciona o novo', async () => {
    const r = await chamar(dono, 'PUT', `/itens/${itemId}`, {
      linhas: [
        { insumo_id: insumoA, quantidade: 0.5 },
        { insumo_id: insumoC, quantidade: 1 },
      ],
    })
    expect(r.statusCode).toBe(200)
    const ids = r.json().linhas.map((l: { insumo_id: string }) => l.insumo_id).sort()
    expect(ids).toEqual([insumoA, insumoC].sort())
    const mapa = Object.fromEntries(r.json().linhas.map((l: { insumo_id: string; quantidade: number }) => [l.insumo_id, l.quantidade]))
    expect(mapa[insumoA]).toBeCloseTo(0.5, 3)
  })

  it('readicionar insumo removido reativa a mesma linha (sem violar unicidade)', async () => {
    const r = await chamar(dono, 'PUT', `/itens/${itemId}`, {
      linhas: [{ insumo_id: insumoB, quantidade: 3 }],
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().linhas).toEqual([{ insumo_id: insumoB, quantidade: 3 }])
  })

  it('PUT vazio zera a ficha (desativa todas as linhas)', async () => {
    const r = await chamar(dono, 'PUT', `/itens/${itemId}`, { linhas: [] })
    expect(r.statusCode).toBe(200)
    expect(r.json().linhas).toEqual([])
  })

  it('rejeita insumo_id repetido (400) e quantidade nao positiva (400)', async () => {
    const dup = await chamar(dono, 'PUT', `/itens/${itemId}`, {
      linhas: [{ insumo_id: insumoA, quantidade: 1 }, { insumo_id: insumoA, quantidade: 2 }],
    })
    expect(dup.statusCode).toBe(400)
    const zero = await chamar(dono, 'PUT', `/itens/${itemId}`, { linhas: [{ insumo_id: insumoA, quantidade: 0 }] })
    expect(zero.statusCode).toBe(400)
  })

  it('insumo de outra loja: 422 insumo_invalido', async () => {
    const contaB = await criarConta(cen, dono)
    const lojaOutra = await criarLoja(contaB)
    lojas.push(lojaOutra)
    const insumoForasteiro = await insumo.criar(lojaOutra, 50)
    const r = await chamar(dono, 'PUT', `/itens/${itemId}`, { linhas: [{ insumo_id: insumoForasteiro, quantidade: 1 }] })
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('insumo_invalido')
  })

  it('atendente le a ficha (200); editar exige loja:gerir (atendente 403)', async () => {
    await chamar(dono, 'PUT', `/itens/${itemId}`, { linhas: [{ insumo_id: insumoA, quantidade: 1 }] })
    expect((await chamar(atendente, 'GET', `/itens/${itemId}`)).statusCode).toBe(200)
    const neg = await chamar(atendente, 'PUT', `/itens/${itemId}`, { linhas: [] })
    expect(neg.statusCode).toBe(403)
  })
})
