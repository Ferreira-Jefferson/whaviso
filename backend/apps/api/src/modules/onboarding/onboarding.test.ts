// API-onboarding: unidade (montar) + integracao contra o banco de teste (role whaviso_api).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import {
  bancoAcessivel, fecharPools, poolApi, poolSuper, novoCenario, criarUsuario, criarConta,
  criarLoja, criarMembro, limpar,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { onboardingRoutes } from './routes'
import { montar } from './service'
import { OnboardingSaida } from './schemas'

const base = new Date('2026-03-04T12:00:00Z')

describe('montar (puro)', () => {
  const vazio = {
    loja_id: randomUUID(), criado_em: base, endereco_ok: false, horarios_ok: false,
    numero_em: null, cardapio_em: null, primeiro_pedido_em: null,
  }
  it('loja nova: nada feito, sem metrica', () => {
    const r = montar(vazio)
    expect(r.concluidas).toBe(0)
    expect(r.percentual).toBe(0)
    expect(r.completo).toBe(false)
    expect(r.tempo_ate_primeiro_pedido_min).toBeNull()
    expect(OnboardingSaida.safeParse(r).success).toBe(true)
  })
  it('perfil exige endereco E horario aberto', () => {
    expect(montar({ ...vazio, endereco_ok: true }).etapas[0]!.concluida).toBe(false)
    expect(montar({ ...vazio, endereco_ok: true, horarios_ok: true }).etapas[0]!.concluida).toBe(true)
  })
  it('completo e tempo ate o 1o pedido em minutos', () => {
    const r = montar({
      ...vazio, endereco_ok: true, horarios_ok: true,
      numero_em: base, cardapio_em: base, primeiro_pedido_em: new Date(base.getTime() + 90 * 60_000),
    })
    expect(r.completo).toBe(true)
    expect(r.percentual).toBe(100)
    expect(r.tempo_ate_primeiro_pedido_min).toBe(90)
  })
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[onboarding] banco de teste inacessivel: integracao PULADA.')

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://projeto.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_DESLIGADO: 'true',
})

d('onboarding (integracao)', () => {
  const c = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let dono: string, atendente: string, donoB: string
  let lojaA: string, lojaB: string

  const get = (u: string, loja: string) =>
    app.inject({
      method: 'GET',
      url: '/v1/onboarding',
      headers: { authorization: `Bearer ${u}`, 'x-loja-id': loja },
    })

  beforeAll(async () => {
    dono = await criarUsuario(c)
    atendente = await criarUsuario(c)
    donoB = await criarUsuario(c)
    const contaA = await criarConta(c, dono)
    const contaB = await criarConta(c, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaA, atendente, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    app = await construirApp({
      env, pool: poolApi, logger: false, verificador: verificadorFake,
      modulos: [{ prefixo: 'onboarding', plugin: onboardingRoutes }],
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await limpar(c)
    await fecharPools()
  })

  it('loja nova: 0% e sem metrica', async () => {
    const r = await get(dono, lojaA)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(OnboardingSaida.safeParse(j).success).toBe(true)
    expect(j.loja_id).toBe(lojaA)
    expect(j.concluidas).toBe(0)
    expect(j.tempo_ate_primeiro_pedido_min).toBeNull()
  })

  it('atendente nao ve (403); sem loja ativa 403; sem token 401; loja de outra conta 404', async () => {
    expect((await get(atendente, lojaA)).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/v1/onboarding' })).statusCode).toBe(401)
    const semLoja = await app.inject({ method: 'GET', url: '/v1/onboarding', headers: { authorization: `Bearer ${dono}` } })
    expect(semLoja.statusCode).toBe(403)
    expect((await get(dono, lojaB)).statusCode).toBe(404)
  })

  it('etapas refletem os dados reais; rascunho nao conta como pedido', async () => {
    const horarios = {
      fuso: 'America/Sao_Paulo',
      dias: Array.from({ length: 7 }, (_, dia) =>
        dia === 1
          ? { dia, fechado: false, faixas: [{ abre: '10:00', fecha: '22:00' }] }
          : { dia, fechado: true, faixas: [] },
      ),
    }
    await poolSuper.query('update public.lojas set endereco = $2::jsonb, horarios = $3::jsonb where id = $1', [
      lojaA,
      JSON.stringify({ rua: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'SP', uf: 'SP', cep: '01000000' }),
      JSON.stringify(horarios),
    ])
    await poolSuper.query(
      `insert into public.numeros_whatsapp (loja_id, phone_number_id, waba_id) values ($1, $2, 'waba')`,
      [lojaA, `pn-${randomUUID()}`],
    )
    const cat = randomUUID()
    await poolSuper.query(`insert into public.categorias (id, loja_id, nome) values ($1, $2, 'Pizzas')`, [cat, lojaA])
    await poolSuper.query(
      `insert into public.itens (loja_id, categoria_id, nome, preco_centavos) values ($1, $2, 'Margherita', 4500)`,
      [lojaA, cat],
    )
    await poolSuper.query(
      `insert into public.pedidos (loja_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1, 'R1', 'rascunho', 4500, 4500)`,
      [lojaA],
    )
    let j = (await get(dono, lojaA)).json()
    expect(j.etapas.map((e: { concluida: boolean }) => e.concluida)).toEqual([true, true, true, false])
    expect(j.percentual).toBe(75)
    expect(j.completo).toBe(false)

    await poolSuper.query(
      `insert into public.pedidos (loja_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1, 'P1', 'novo', 4500, 4500)`,
      [lojaA],
    )
    j = (await get(dono, lojaA)).json()
    expect(j.completo).toBe(true)
    expect(j.tempo_ate_primeiro_pedido_min).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(j)).not.toContain('pn-')
  })

  it('isolamento: dados da loja A nao contaminam a B', async () => {
    const j = (await get(donoB, lojaB)).json()
    expect(j.loja_id).toBe(lojaB)
    expect(j.concluidas).toBe(0)
  })
})
