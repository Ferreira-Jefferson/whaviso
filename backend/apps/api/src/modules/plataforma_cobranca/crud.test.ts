// Integracao do modulo plataforma_cobranca contra o Postgres local. Cobre o ciclo completo:
// criar assinatura -> gerar fatura (idempotente) -> atraso -> suspensao (trigger reflete em
// lojas.suspensa) -> baixa + reativacao; transicoes invalidas; e a suspensao de conta inteira
// (assinatura com loja_id NULL) atingindo todas as lojas da conta.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarCobrancaRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[plataforma_cobranca] banco inacessivel: integracao PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('cobranca-teste', 'error'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'plataforma-cobranca', plugin: criarCobrancaRoutes() }],
  })
  await app.ready()
  return app
}

async function suspensaDaLoja(lojaId: string): Promise<boolean> {
  const { rows } = await poolSuper.query<{ suspensa: boolean }>(
    'select suspensa from public.lojas where id = $1', [lojaId])
  return rows[0]!.suspensa
}

d('modulo plataforma_cobranca (integracao)', () => {
  const cen = novoCenario()
  const lojas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let operador: string, dono: string, contaA: string, lojaA: string
  let contaB: string, lojaB1: string, lojaB2: string

  const op = (metodo: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/plataforma-cobranca${url}`,
      headers: { authorization: `Bearer ${operador}` },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    operador = await criarUsuario(cen)
    await criarOperador(operador)
    dono = await criarUsuario(cen)
    contaA = await criarConta(cen, dono)
    lojaA = await criarLoja(contaA)
    await criarMembro(contaA, dono, 'dono', null)
    contaB = await criarConta(cen, await criarUsuario(cen))
    lojaB1 = await criarLoja(contaB)
    lojaB2 = await criarLoja(contaB)
    lojas.push(lojaA, lojaB1, lojaB2)
    app = await montar()
  })

  afterAll(async () => {
    await app.close()
    await poolSuper.query(
      `delete from public.eventos where loja_id = any($1::uuid[])
         or entidade_id in (select id from public.assinaturas where conta_id = any($2::uuid[]))
         or entidade_id in (select id from public.faturas where conta_id = any($2::uuid[]))`,
      [lojas, cen.contas],
    ).catch(() => {})
    await poolSuper.query('delete from public.faturas where conta_id = any($1::uuid[])', [cen.contas]).catch(() => {})
    await poolSuper.query('delete from public.assinaturas where conta_id = any($1::uuid[])', [cen.contas]).catch(() => {})
    await limpar(cen)
    await fecharPools()
  })

  let assinaturaA = ''
  let faturaA = ''

  it('operador cria assinatura ativa (conta + loja); nasce nao suspensa', async () => {
    const r = await op('POST', '/assinaturas', {
      conta_id: contaA, loja_id: lojaA, status: 'ativa', valor_mensal_centavos: 70000, dia_vencimento: 10,
    })
    expect(r.statusCode, r.body).toBe(201)
    const a = r.json()
    assinaturaA = a.id
    expect(a).toMatchObject({ conta_id: contaA, loja_id: lojaA, status: 'ativa', valor_mensal_centavos: 70000 })
    expect(a.inicio_em).toMatch(/Z$/)
    expect(await suspensaDaLoja(lojaA)).toBe(false)
  })

  it('gera fatura de uma competencia passada e e idempotente na 2a passada', async () => {
    const r1 = await op('POST', '/cobranca/gerar-faturas', { competencia: '2026-09-01' })
    expect(r1.statusCode, r1.body).toBe(200)
    expect(r1.json()).toMatchObject({ competencia: '2026-09-01', geradas: 1, ja_existiam: 0 })
    const r2 = await op('POST', '/cobranca/gerar-faturas', { competencia: '2026-09-01' })
    expect(r2.json()).toMatchObject({ geradas: 0, ja_existiam: 1 })

    const faturas = (await op('GET', `/faturas?conta_id=${contaA}`)).json()
    expect(faturas).toHaveLength(1)
    expect(faturas[0]).toMatchObject({
      conta_id: contaA, competencia: '2026-09-01', vencimento: '2026-09-10', valor_centavos: 70000, status: 'aberta',
    })
    faturaA = faturas[0].id
  })

  it('apura atraso: fatura vira atrasada e a assinatura e suspensa (trigger reflete em lojas.suspensa)', async () => {
    const r = await op('POST', '/cobranca/apurar-atrasos')
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ marcadas_atrasadas: 1, assinaturas_suspensas: 1 })

    const faturas = (await op('GET', `/faturas?conta_id=${contaA}`)).json()
    expect(faturas[0].status).toBe('atrasada')
    const ass = (await op('GET', `/assinaturas?conta_id=${contaA}`)).json()
    expect(ass[0].status).toBe('suspensa')
    expect(await suspensaDaLoja(lojaA)).toBe(true)
  })

  it('apurar atraso de novo e idempotente (nada novo a marcar nem suspender)', async () => {
    const r = await op('POST', '/cobranca/apurar-atrasos')
    expect(r.json()).toMatchObject({ marcadas_atrasadas: 0, assinaturas_suspensas: 0 })
  })

  it('baixa manual com reativar=true: fatura paga, assinatura reativada e loja liberada', async () => {
    const r = await op('POST', `/faturas/${faturaA}/pagar`, { reativar: true })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ id: faturaA, status: 'paga' })
    expect(r.json().pago_em).toMatch(/Z$/)
    const ass = (await op('GET', `/assinaturas?conta_id=${contaA}`)).json()
    expect(ass[0].status).toBe('ativa')
    expect(await suspensaDaLoja(lojaA)).toBe(false)
  })

  it('pagar fatura ja paga: 409 fatura_estado_invalido; fatura inexistente: 404', async () => {
    const jaPaga = await op('POST', `/faturas/${faturaA}/pagar`, { reativar: false })
    expect(jaPaga.statusCode).toBe(409)
    expect(jaPaga.json().error.code).toBe('fatura_estado_invalido')
    const inexistente = await op('POST', `/faturas/00000000-0000-0000-0000-000000000000/pagar`, {})
    expect(inexistente.statusCode).toBe(404)
  })

  it('transicao invalida (ativa -> trial) e recusada com 409', async () => {
    const r = await op('PATCH', `/assinaturas/${assinaturaA}`, { status: 'trial' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('transicao_invalida')
  })

  it('alterar valor vale para faturas futuras; a fatura ja emitida nao muda de valor', async () => {
    const r = await op('PATCH', `/assinaturas/${assinaturaA}`, { valor_mensal_centavos: 90000 })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().valor_mensal_centavos).toBe(90000)
    const fat = (await op('GET', `/faturas?conta_id=${contaA}`)).json()
    expect(fat[0].valor_centavos).toBe(70000) // fatura emitida e imutavel no valor
  })

  it('cancelar a assinatura suspende a loja (status terminal reflete na flag)', async () => {
    const r = await op('PATCH', `/assinaturas/${assinaturaA}`, { status: 'cancelada' })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().status).toBe('cancelada')
    expect(r.json().cancelada_em).toMatch(/Z$/)
    expect(await suspensaDaLoja(lojaA)).toBe(true)
  })

  it('assinatura de conta inteira (loja_id NULL): suspensao atinge TODAS as lojas da conta', async () => {
    const criada = await op('POST', '/assinaturas', { conta_id: contaB, status: 'ativa', dia_vencimento: 5 })
    expect(criada.statusCode, criada.body).toBe(201)
    expect(criada.json().loja_id).toBeNull()
    expect(await suspensaDaLoja(lojaB1)).toBe(false)
    expect(await suspensaDaLoja(lojaB2)).toBe(false)

    const susp = await op('PATCH', `/assinaturas/${criada.json().id}`, { status: 'suspensa' })
    expect(susp.statusCode, susp.body).toBe(200)
    expect(await suspensaDaLoja(lojaB1)).toBe(true)
    expect(await suspensaDaLoja(lojaB2)).toBe(true)

    // Reativar a assinatura da conta libera as duas lojas de novo.
    const reat = await op('PATCH', `/assinaturas/${criada.json().id}`, { status: 'ativa' })
    expect(reat.statusCode).toBe(200)
    expect(await suspensaDaLoja(lojaB1)).toBe(false)
    expect(await suspensaDaLoja(lojaB2)).toBe(false)
  })

  it('criar assinatura para conta inexistente: 404; loja de outra conta: 422', async () => {
    const semConta = await op('POST', '/assinaturas', { conta_id: '00000000-0000-0000-0000-000000000000' })
    expect(semConta.statusCode).toBe(404)
    const lojaErrada = await op('POST', '/assinaturas', { conta_id: contaA, loja_id: lojaB1 })
    expect(lojaErrada.statusCode).toBe(422)
    expect(lojaErrada.json().error.code).toBe('loja_fora_da_conta')
  })
})
