// Seguranca do modulo disponibilidade: isolamento multi-tenant (SEC-001/002), permissao de escrita
// (atendente le mas nao gere; so gestor escreve) e autenticacao. Postgres local (role whaviso_api).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarDisponibilidadeRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[disponibilidade/seg] banco inacessivel: integracao PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('disponibilidade-seg', 'info'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'disponibilidade', plugin: criarDisponibilidadeRoutes() }],
  })
  await app.ready()
  return app
}

d('modulo disponibilidade (seguranca)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let donoA: string, atendA: string, donoB: string
  let lojaA: string, lojaB: string
  let horA = ''

  const chamar = (
    user: string, loja: string | null, metodo: 'GET' | 'POST' | 'PATCH' | 'PUT',
    url: string, payload?: unknown,
  ) =>
    app.inject({
      method: metodo,
      url: `/v1/disponibilidade${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    atendA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    lojas.push(lojaA, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaA, atendA, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    app = await montar()
    horA = (await chamar(donoA, lojaA, 'POST', '/horarios', { dia_semana: 2, abre: '09:00', fecha: '18:00' })).json().id
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojas) {
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  it('atendente le horarios/janela/excecoes mas NAO escreve (403)', async () => {
    expect((await chamar(atendA, lojaA, 'GET', '/horarios')).statusCode).toBe(200)
    expect((await chamar(atendA, lojaA, 'GET', '/agendamento')).statusCode).toBe(200)
    expect((await chamar(atendA, lojaA, 'GET', '/excecoes')).statusCode).toBe(200)
    expect((await chamar(atendA, lojaA, 'POST', '/horarios', { dia_semana: 3, abre: '09:00', fecha: '18:00' })).statusCode).toBe(403)
    expect((await chamar(atendA, lojaA, 'PUT', '/agendamento', { modo: 'faixa', inicio: '08:00', fim: '20:00', dias: [1] })).statusCode).toBe(403)
    expect((await chamar(atendA, lojaA, 'POST', '/excecoes', { data: '2026-11-15', fechado: true })).statusCode).toBe(403)
  })

  it('SEC-001/002: loja B nao enxerga nem altera horario da loja A', async () => {
    const listaB = (await chamar(donoB, lojaB, 'GET', '/horarios')).json().itens
    expect(listaB.map((h: { id: string }) => h.id)).not.toContain(horA)
    // x-loja-id de outra conta: 404 (nao confirma existencia).
    expect((await chamar(donoB, lojaA, 'GET', '/horarios')).statusCode).toBe(404)
    // PATCH/desativar no horario da loja A pelo escopo da loja B: 404.
    expect((await chamar(donoB, lojaB, 'PATCH', `/horarios/${horA}`, { fecha: '20:00' })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', `/horarios/${horA}/desativar`)).statusCode).toBe(404)
  })

  it('sem autenticacao: 401; sem loja ativa (x-loja-id): 422', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/disponibilidade/horarios' })).statusCode).toBe(401)
    const semLoja = await chamar(donoA, null, 'GET', '/horarios')
    expect(semLoja.statusCode).toBe(422)
    expect(semLoja.json().error.code).toBe('loja_ativa_obrigatoria')
  })
})
