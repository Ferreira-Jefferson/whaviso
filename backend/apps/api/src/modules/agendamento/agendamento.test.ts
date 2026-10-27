// Integracao do modulo agendamento contra o Postgres local (role whaviso_api).
// Cobre definir/limpar, passado e horizonte (422), status agendavel, agenda e janelas,
// isolamento multi-tenant e permissao.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { agendamentoRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[agendamento] banco inacessivel: integracao PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('agendamento-teste', 'silent'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'agendamento', plugin: agendamentoRoutes }],
  })
  await app.ready()
  return app
}

const emMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString()

d('modulo agendamento (integracao)', () => {
  const cen = novoCenario()
  const lojasCriadas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let donoA: string, donoB: string
  let lojaA: string, lojaB: string
  const ped: Record<string, string> = {}

  const chamar = (
    user: string,
    loja: string | null,
    metodo: 'GET' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method: metodo,
      url: `/v1/agendamento${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  async function pedido(loja: string, codigo: string, status: string) {
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.pedidos (loja_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1,$2,$3,1000,1000) returning id`,
      [loja, codigo, status],
    )
    return rows[0]!.id
  }

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    lojasCriadas.push(lojaA, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaB, donoB, 'dono', null)
    ped.a1 = await pedido(lojaA, 'G1', 'novo')
    ped.a2 = await pedido(lojaA, 'G2', 'novo')
    ped.a3 = await pedido(lojaA, 'G3', 'novo')
    ped.prep = await pedido(lojaA, 'G4', 'em_preparo')
    ped.b1 = await pedido(lojaB, 'H1', 'novo')
    app = await montar()
  })

  afterAll(async () => {
    await app?.close()
    for (const l of lojasCriadas) {
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.pedidos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  it('define: 200 com instante, janela futuro; evento sem PII', async () => {
    const quando = emMin(300)
    const r = await chamar(donoA, lojaA, 'PUT', `/${ped.a1}`, { agendado_para: quando })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ pedido_id: ped.a1, codigo: 'G1', janela: 'futuro', total_centavos: 1000 })
    expect(r.json().agendado_para).toMatch(/Z$/)
    const ev = await poolSuper.query(`select detalhes from public.eventos where loja_id=$1 and tipo='pedido.agendado'`, [lojaA])
    expect(ev.rows).toHaveLength(1)
    expect(Object.keys(ev.rows[0].detalhes).sort()).toEqual(['agendado_para', 'user_id'])
  })

  it('passado: 422 agendamento_no_passado; alem de 30 dias: 422 agendamento_muito_distante', async () => {
    const a = await chamar(donoA, lojaA, 'PUT', `/${ped.a2}`, { agendado_para: emMin(-5) })
    expect(a.statusCode).toBe(422)
    expect(a.json().error.code).toBe('agendamento_no_passado')
    const b = await chamar(donoA, lojaA, 'PUT', `/${ped.a2}`, { agendado_para: emMin(31 * 1440) })
    expect(b.statusCode).toBe(422)
    expect(b.json().error.code).toBe('agendamento_muito_distante')
  })

  it('entrada invalida (nao-data, campo extra loja_id): 400', async () => {
    for (const body of [{ agendado_para: 'amanha' }, { agendado_para: emMin(10), loja_id: lojaB }, {}]) {
      const r = await chamar(donoA, lojaA, 'PUT', `/${ped.a2}`, body)
      expect(r.statusCode).toBe(400)
    }
  })

  it('pedido em preparo: 422 pedido_nao_agendavel; inexistente e de outra loja: 404', async () => {
    const a = await chamar(donoA, lojaA, 'PUT', `/${ped.prep}`, { agendado_para: emMin(60) })
    expect(a.statusCode).toBe(422)
    expect(a.json().error.code).toBe('pedido_nao_agendavel')
    const b = await chamar(donoA, lojaA, 'PUT', `/${crypto.randomUUID()}`, { agendado_para: emMin(60) })
    expect(b.statusCode).toBe(404)
    const c = await chamar(donoA, lojaA, 'PUT', `/${ped.b1}`, { agendado_para: emMin(60) })
    expect(c.statusCode).toBe(404)
  })

  it('agenda: ordenada, janelas liberar/futuro e filtro; so da loja', async () => {
    await chamar(donoA, lojaA, 'PUT', `/${ped.a2}`, { agendado_para: emMin(30) })
    await chamar(donoB, lojaB, 'PUT', `/${ped.b1}`, { agendado_para: emMin(40) })
    const r = await chamar(donoA, lojaA, 'GET', '')
    expect(r.statusCode).toBe(200)
    const itens = r.json().itens as { codigo: string; janela: string }[]
    expect(itens.map((i) => i.codigo)).toEqual(['G2', 'G1'])
    expect(itens.map((i) => i.janela)).toEqual(['liberar', 'futuro'])
    const f = await chamar(donoA, lojaA, 'GET', '?janela=liberar')
    expect(f.json().itens.map((i: { codigo: string }) => i.codigo)).toEqual(['G2'])
    const p = await chamar(donoA, lojaA, 'GET', '?limite=1')
    expect(p.json().itens).toHaveLength(1)
    expect(p.json().proximoCursor).not.toBeNull()
    const p2 = await chamar(donoA, lojaA, 'GET', `?limite=1&cursor=${p.json().proximoCursor}`)
    expect(p2.json().itens.map((i: { codigo: string }) => i.codigo)).toEqual(['G1'])
    expect(p2.json().proximoCursor).toBeNull()
  })

  it('limpa: volta a imediato (janela null), sai da agenda, idempotente', async () => {
    const r = await chamar(donoA, lojaA, 'DELETE', `/${ped.a1}`)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ agendado_para: null, janela: null })
    const again = await chamar(donoA, lojaA, 'DELETE', `/${ped.a1}`)
    expect(again.statusCode).toBe(200)
    const lista = await chamar(donoA, lojaA, 'GET', '')
    expect(lista.json().itens.map((i: { codigo: string }) => i.codigo)).toEqual(['G2'])
  })

  it('sem loja ativa: 422; sem token: 401; detalhe de outra loja: 404', async () => {
    const a = await chamar(donoA, null, 'GET', '')
    expect([400, 403, 422]).toContain(a.statusCode)
    const b = await app.inject({ method: 'GET', url: '/v1/agendamento' })
    expect(b.statusCode).toBe(401)
    const c = await chamar(donoA, lojaA, 'GET', `/${ped.b1}`)
    expect(c.statusCode).toBe(404)
  })
})
