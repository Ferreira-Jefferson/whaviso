// Integracao do modulo disponibilidade contra o Postgres local (role whaviso_api).
// Cobre CRUD de horarios (com sobreposicao), janela do atendente, excecoes e o estado derivado.
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
if (!online) console.warn('[disponibilidade] banco inacessivel: integracao PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('disponibilidade-teste', 'info'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'disponibilidade', plugin: criarDisponibilidadeRoutes() }],
  })
  await app.ready()
  return app
}

d('modulo disponibilidade (integracao)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let dono: string, lojaA: string

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
    dono = await criarUsuario(cen)
    const conta = await criarConta(cen, dono)
    lojaA = await criarLoja(conta)
    lojas.push(lojaA)
    await criarMembro(conta, dono, 'dono', null)
    app = await montar()
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojas) {
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  // --- horarios ---
  let horId = ''
  it('cria horario: 201 com HH:mm e ativo=true; rejeita campo extra', async () => {
    const r = await chamar(dono, lojaA, 'POST', '/horarios', { dia_semana: 1, abre: '09:00', fecha: '12:00' })
    expect(r.statusCode).toBe(201)
    const h = r.json()
    horId = h.id
    expect(h).toMatchObject({ dia_semana: 1, abre: '09:00', fecha: '12:00', ativo: true })
    expect(h.criado_em).toMatch(/Z$/)
    const extra = await chamar(dono, lojaA, 'POST', '/horarios', { dia_semana: 1, abre: '09:00', fecha: '12:00', loja_id: lojaA })
    expect(extra.statusCode).toBe(400)
  })

  it('faixa sobreposta no mesmo dia: 422; faixa adjacente: 201', async () => {
    const sob = await chamar(dono, lojaA, 'POST', '/horarios', { dia_semana: 1, abre: '11:00', fecha: '15:00' })
    expect(sob.statusCode).toBe(422)
    expect(sob.json().error.code).toBe('horario_sobreposto')
    const adj = await chamar(dono, lojaA, 'POST', '/horarios', { dia_semana: 1, abre: '12:00', fecha: '15:00' })
    expect(adj.statusCode).toBe(201)
  })

  it('lista ordenada por dia e abre', async () => {
    const r = await chamar(dono, lojaA, 'GET', '/horarios')
    expect(r.statusCode).toBe(200)
    const itens = r.json().itens as { abre: string }[]
    expect(itens).toHaveLength(2)
    expect(itens.map((i) => i.abre)).toEqual(['09:00', '12:00'])
  })

  it('PATCH altera a faixa; patch que gera sobreposicao: 422', async () => {
    const ok = await chamar(dono, lojaA, 'PATCH', `/horarios/${horId}`, { fecha: '11:00' })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().fecha).toBe('11:00')
    const ruim = await chamar(dono, lojaA, 'PATCH', `/horarios/${horId}`, { fecha: '13:00' })
    expect(ruim.statusCode).toBe(422)
  })

  it('desativar some da lista e libera a faixa', async () => {
    const des = await chamar(dono, lojaA, 'POST', `/horarios/${horId}/desativar`)
    expect(des.json().ativo).toBe(false)
    const itens = (await chamar(dono, lojaA, 'GET', '/horarios')).json().itens
    expect(itens.map((i: { id: string }) => i.id)).not.toContain(horId)
    const reusar = await chamar(dono, lojaA, 'POST', '/horarios', { dia_semana: 1, abre: '08:00', fecha: '12:00' })
    expect(reusar.statusCode).toBe(201)
  })

  // --- janela do atendente ---
  it('janela: vazia vira null; PUT cria e depois atualiza (upsert)', async () => {
    expect((await chamar(dono, lojaA, 'GET', '/janela')).json()).toEqual({ janela: null })
    const posta = await chamar(dono, lojaA, 'PUT', '/janela', { inicio: '08:00', fim: '20:00', dias: [1, 2, 3] })
    expect(posta.statusCode).toBe(200)
    expect(posta.json()).toMatchObject({ inicio: '08:00', fim: '20:00', dias: [1, 2, 3], ativo: true })
    const atual = await chamar(dono, lojaA, 'PUT', '/janela', { inicio: '10:00', fim: '18:00', dias: [5], ativo: false })
    expect(atual.json()).toMatchObject({ inicio: '10:00', dias: [5], ativo: false })
    expect((await chamar(dono, lojaA, 'GET', '/janela')).json().janela.inicio).toBe('10:00')
    const ruim = await chamar(dono, lojaA, 'PUT', '/janela', { inicio: '10:00', fim: '18:00', dias: [] })
    expect(ruim.statusCode).toBe(400)
  })

  // --- excecoes ---
  let excId = ''
  it('excecao fechada: 201 sem faixa; data repetida ativa: 409; aberta sem faixa: 400', async () => {
    const r = await chamar(dono, lojaA, 'POST', '/excecoes', { data: '2026-12-25', fechado: true, motivo: 'Natal' })
    expect(r.statusCode).toBe(201)
    excId = r.json().id
    expect(r.json()).toMatchObject({ data: '2026-12-25', fechado: true, abre: null, fecha: null, ativo: true })
    const dup = await chamar(dono, lojaA, 'POST', '/excecoes', { data: '2026-12-25', fechado: true })
    expect(dup.statusCode).toBe(409)
    const aberta = await chamar(dono, lojaA, 'POST', '/excecoes', { data: '2026-12-31', fechado: false })
    expect(aberta.statusCode).toBe(400)
    const ok = await chamar(dono, lojaA, 'POST', '/excecoes', { data: '2026-12-31', fechado: false, abre: '09:00', fecha: '14:00' })
    expect(ok.statusCode).toBe(201)
  })

  it('desativar excecao some da lista e libera recadastro da data', async () => {
    const des = await chamar(dono, lojaA, 'POST', `/excecoes/${excId}/desativar`)
    expect(des.json().ativo).toBe(false)
    const datas = (await chamar(dono, lojaA, 'GET', '/excecoes')).json().itens.map((e: { id: string }) => e.id)
    expect(datas).not.toContain(excId)
    const reusar = await chamar(dono, lojaA, 'POST', '/excecoes', { data: '2026-12-25', fechado: true })
    expect(reusar.statusCode).toBe(201)
  })

  // --- estado derivado ---
  it('GET /agora devolve os dois booleanos derivados e um instante UTC', async () => {
    const r = await chamar(dono, lojaA, 'GET', '/agora')
    expect(r.statusCode).toBe(200)
    const s = r.json()
    expect(typeof s.aceitando_agora).toBe('boolean')
    expect(typeof s.atendente_pode_responder).toBe('boolean')
    expect(s.agora).toMatch(/Z$/)
  })
})
