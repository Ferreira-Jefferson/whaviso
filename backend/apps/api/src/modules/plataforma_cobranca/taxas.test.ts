// Taxa de intermediacao: config padrao da plataforma, override por plano e resolucao por conta.
// Integracao com Postgres local. O catalogo (padrao + taxas por plano) e cacheado em processo;
// o servico invalida o cache a cada escrita, e o teste invalida antes de resolver para ler fresco.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import { invalidarCacheTaxas, resolverTaxaIntermediacao } from '@whaviso/shared/taxas'
import {
  bancoAcessivel, criarConta, criarOperador, criarUsuario, fecharPools, limpar, novoCenario,
  poolApi, poolSuper,
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

d('plataforma_cobranca: taxa de intermediacao (integracao)', () => {
  const cen = novoCenario()
  const sufixo = Math.random().toString(36).slice(2, 8)
  let app: Awaited<ReturnType<typeof construirApp>>
  let admin: string, comum: string
  const planosCriados: string[] = []
  const contasCriadas: string[] = []

  const req = (quem: string, metodo: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/plataforma-cobranca${url}`,
      headers: { authorization: `Bearer ${quem}` },
      payload: payload as object | undefined,
    })

  const novaConta = async () => {
    const c = await criarConta(cen, await criarUsuario(cen))
    contasCriadas.push(c)
    return c
  }

  beforeAll(async () => {
    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('taxas-teste', 'error'),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'plataforma-cobranca', plugin: criarCobrancaRoutes() }],
    })
    await app.ready()
    admin = await criarUsuario(cen)
    await criarOperador(admin, 'admin')
    comum = await criarUsuario(cen)
    await criarOperador(comum, 'operador')
  })

  afterAll(async () => {
    await app.close()
    // Restaura o padrao semeado (singleton global) para nao vazar entre arquivos do mesmo worker.
    await poolSuper.query('update public.config_plataforma set taxa_intermediacao_padrao_centavos = 50 where id = 1').catch(() => {})
    for (const c of contasCriadas) {
      await poolSuper.query('delete from public.eventos where entidade_id in (select id from public.assinaturas where conta_id = $1)', [c]).catch(() => {})
      await poolSuper.query('delete from public.assinaturas where conta_id = $1', [c]).catch(() => {})
    }
    await poolSuper.query("delete from public.eventos where entidade = 'config_plataforma'").catch(() => {})
    await poolSuper.query('delete from public.planos where id = any($1::uuid[])', [planosCriados]).catch(() => {})
    await limpar(cen)
    await fecharPools()
  })

  it('GET /config/taxa devolve o padrao semeado (50); operador comum recebe 403 (SEC-041)', async () => {
    const r = await req(admin, 'GET', '/config/taxa')
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().taxa_intermediacao_padrao_centavos).toBe(50)
    expect((await req(comum, 'GET', '/config/taxa')).statusCode).toBe(403)
    expect((await req(comum, 'PUT', '/config/taxa', { taxa_intermediacao_padrao_centavos: 10 })).statusCode).toBe(403)
  })

  it('PUT /config/taxa altera o padrao e valida (>= 0, inteiro)', async () => {
    const r = await req(admin, 'PUT', '/config/taxa', { taxa_intermediacao_padrao_centavos: 30 })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().taxa_intermediacao_padrao_centavos).toBe(30)
    expect((await req(admin, 'GET', '/config/taxa')).json().taxa_intermediacao_padrao_centavos).toBe(30)
    expect((await req(admin, 'PUT', '/config/taxa', { taxa_intermediacao_padrao_centavos: -1 })).statusCode).toBe(400)
    expect((await req(admin, 'PUT', '/config/taxa', { taxa_intermediacao_padrao_centavos: 1.5 })).statusCode).toBe(400)
    await req(admin, 'PUT', '/config/taxa', { taxa_intermediacao_padrao_centavos: 50 }) // restaura
  })

  it('plano aceita override, herda por null e aceita 0 como taxa zero explicita', async () => {
    const criar = await req(admin, 'POST', '/planos', {
      nome: `Taxa ${sufixo}`, valor_centavos: 1000, taxa_intermediacao_centavos: 40,
    })
    expect(criar.statusCode, criar.body).toBe(201)
    const plano = criar.json()
    planosCriados.push(plano.id)
    expect(plano.taxa_intermediacao_centavos).toBe(40)

    const limpa = await req(admin, 'PATCH', `/planos/${plano.id}`, { taxa_intermediacao_centavos: null })
    expect(limpa.statusCode, limpa.body).toBe(200)
    expect(limpa.json().taxa_intermediacao_centavos).toBeNull()

    const zero = await req(admin, 'PATCH', `/planos/${plano.id}`, { taxa_intermediacao_centavos: 0 })
    expect(zero.json().taxa_intermediacao_centavos).toBe(0)

    const semTaxa = await req(admin, 'POST', '/planos', { nome: `SemTaxa ${sufixo}`, valor_centavos: 1000 })
    const p2 = semTaxa.json()
    planosCriados.push(p2.id)
    expect(p2.taxa_intermediacao_centavos).toBeNull()
  })

  it('resolve a taxa por conta: override do plano vence; null/sem plano herda o padrao', async () => {
    // padrao atual = 50 (restaurado acima)
    const planoOv = (await req(admin, 'POST', '/planos', {
      nome: `Ov ${sufixo}`, valor_centavos: 1000, taxa_intermediacao_centavos: 35,
    })).json()
    planosCriados.push(planoOv.id)
    const contaOverride = await novaConta()
    await req(admin, 'POST', '/assinaturas', { conta_id: contaOverride, status: 'ativa', plano_id: planoOv.id })
    invalidarCacheTaxas()
    expect(await resolverTaxaIntermediacao(poolApi, contaOverride)).toBe(35)

    // Assinatura ativa sem plano_id -> herda o padrao (50).
    const contaSemPlano = await novaConta()
    await req(admin, 'POST', '/assinaturas', { conta_id: contaSemPlano, status: 'ativa' })
    invalidarCacheTaxas()
    expect(await resolverTaxaIntermediacao(poolApi, contaSemPlano)).toBe(50)

    // Plano com taxa null tambem herda o padrao.
    const planoHerda = (await req(admin, 'POST', '/planos', { nome: `Herda ${sufixo}`, valor_centavos: 1000 })).json()
    planosCriados.push(planoHerda.id)
    const contaHerda = await novaConta()
    await req(admin, 'POST', '/assinaturas', { conta_id: contaHerda, status: 'ativa', plano_id: planoHerda.id })
    invalidarCacheTaxas()
    expect(await resolverTaxaIntermediacao(poolApi, contaHerda)).toBe(50)

    // Mudar o padrao reflete em quem herda (apos a invalidacao feita pelo servico), mas nao no override.
    await req(admin, 'PUT', '/config/taxa', { taxa_intermediacao_padrao_centavos: 20 })
    expect(await resolverTaxaIntermediacao(poolApi, contaHerda)).toBe(20)
    expect(await resolverTaxaIntermediacao(poolApi, contaOverride)).toBe(35)
  })
})
