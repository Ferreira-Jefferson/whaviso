// Integracao do modulo fluxo contra o Postgres local (role whaviso_api).
// Cobre criacao, rascunho (controle otimista), validar, publicar (atomico, 422 grafo_invalido),
// historico/restauracao, ativacao, multi-tenant, permissao por papel, trigger de imutabilidade e
// matriz de privilegios (atendente so le; api sem DELETE).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { fluxoRoutes } from './routes'
import { FLUXO_PADRAO } from './schemas'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[fluxo] banco inacessivel: integracao PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('fluxo-teste', 'silent'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'fluxo', plugin: fluxoRoutes }],
  })
  await app.ready()
  return app
}

d('modulo fluxo (integracao)', () => {
  const cen = novoCenario()
  const lojasCriadas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let donoA: string, gerA: string, atendA: string, donoB: string
  let lojaA: string, lojaB: string

  const chamar = (
    user: string, loja: string | null, metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown,
  ) =>
    app.inject({
      method: metodo,
      url: `/v1/fluxo${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    gerA = await criarUsuario(cen)
    atendA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    lojasCriadas.push(lojaA, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaA, gerA, 'gerente', lojaA)
    await criarMembro(contaA, atendA, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    app = await montar()
  })

  afterAll(async () => {
    await app?.close()
    for (const l of lojasCriadas) {
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.fluxo_versoes where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.fluxos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  let fluxoId = ''
  let rascunhoEm = ''

  it('catalogo: lista fechada de nodes com JSON Schema da config e sem tipo de HTTP/codigo', async () => {
    const r = await chamar(atendA, lojaA, 'GET', '/catalogo')
    expect(r.statusCode).toBe(200)
    const nodes = r.json().nodes as { tipo: string; config_schema: object; irreversivel: boolean }[]
    expect(nodes.map((n) => n.tipo)).toContain('confirmar')
    expect(nodes.every((n) => !/http|codigo|script|expr/.test(n.tipo))).toBe(true)
    expect(nodes.find((n) => n.tipo === 'pagamento')!.irreversivel).toBe(true)
    expect(Object.keys(nodes[0]!.config_schema).length).toBeGreaterThan(0)
  })

  it('cria fluxo (gerente) com rascunho v1 a partir do padrao; inativo; sem publicada', async () => {
    const r = await chamar(gerA, lojaA, 'POST', '', { nome: 'Fluxo principal' })
    expect(r.statusCode).toBe(201)
    const f = r.json()
    fluxoId = f.id
    expect(f).toMatchObject({ nome: 'Fluxo principal', ativo: false, publicada: null })
    expect(f.rascunho).toMatchObject({ versao: 1, status: 'rascunho', publicada_em: null })
    expect(f.rascunho.grafo).toEqual(FLUXO_PADRAO)
    rascunhoEm = f.rascunho.atualizado_em
  })

  it('permissao: atendente le mas nao cria/edita/publica (403)', async () => {
    expect((await chamar(atendA, lojaA, 'GET', `/${fluxoId}`)).statusCode).toBe(200)
    expect((await chamar(atendA, lojaA, 'GET', '')).statusCode).toBe(200)
    expect((await chamar(atendA, lojaA, 'POST', '', { nome: 'x' })).statusCode).toBe(403)
    expect((await chamar(atendA, lojaA, 'PUT', `/${fluxoId}/rascunho`, { grafo: FLUXO_PADRAO })).statusCode).toBe(403)
    expect((await chamar(atendA, lojaA, 'POST', `/${fluxoId}/rascunho/publicar`)).statusCode).toBe(403)
    expect((await chamar(atendA, lojaA, 'POST', `/${fluxoId}/ativar`)).statusCode).toBe(403)
  })

  it('multi-tenant: outra loja nao ve (404) e a loja_id do corpo e rejeitada', async () => {
    expect((await chamar(donoB, lojaB, 'GET', `/${fluxoId}`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'PUT', `/${fluxoId}/rascunho`, { grafo: FLUXO_PADRAO })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', `/${fluxoId}/rascunho/publicar`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'GET', `/${fluxoId}/versoes`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'GET', '')).json().itens).toHaveLength(0)
    expect((await chamar(donoB, lojaA, 'GET', '')).statusCode).toBeGreaterThanOrEqual(403)
    const forjado = await chamar(donoA, lojaA, 'POST', '', { nome: 'y', loja_id: lojaB })
    expect(forjado.statusCode).toBe(400)
  })

  it('PUT rascunho: salva o grafo; controle otimista (409) com base desatualizada', async () => {
    const g = structuredClone(FLUXO_PADRAO)
    g.nodes.find((n) => n.id === 'saudacao')!.config = { mensagem: 'Oi, o que vai ser hoje?' }
    const ok = await chamar(donoA, lojaA, 'PUT', `/${fluxoId}/rascunho`, { grafo: g, atualizado_em_base: rascunhoEm })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().rascunho.grafo.nodes[0].config.mensagem).toBe('Oi, o que vai ser hoje?')
    const velho = await chamar(donoA, lojaA, 'PUT', `/${fluxoId}/rascunho`, { grafo: g, atualizado_em_base: rascunhoEm })
    expect(velho.statusCode).toBe(409)
    expect(velho.json().error.code).toBe('conflito_edicao')
    rascunhoEm = ok.json().rascunho.atualizado_em
  })

  it('PUT rascunho: forma invalida (id fora do formato, campo extra) = 400', async () => {
    const ruim = structuredClone(FLUXO_PADRAO) as unknown as { nodes: { id: string }[] }
    ruim.nodes[0]!.id = 'Node 1; drop'
    const a = await chamar(donoA, lojaA, 'PUT', `/${fluxoId}/rascunho`, { grafo: ruim })
    expect(a.statusCode).toBe(400)
    const b = await chamar(donoA, lojaA, 'PUT', `/${fluxoId}/rascunho`, { grafo: { ...FLUXO_PADRAO, extra: 1 } })
    expect(b.statusCode).toBe(400)
  })

  it('validar: grafo malicioso (atalho sem confirmar) salva como rascunho mas e invalido', async () => {
    const g = structuredClone(FLUXO_PADRAO)
    g.edges = g.edges.filter((e) => e.id !== 'e_montar')
    g.edges.push({ id: 'atalho', de: 'montar_pedido', handle: 'proximo', para: 'pagamento' })
    const salvo = await chamar(donoA, lojaA, 'PUT', `/${fluxoId}/rascunho`, { grafo: g })
    expect(salvo.statusCode).toBe(200)
    const v = (await chamar(donoA, lojaA, 'POST', `/${fluxoId}/rascunho/validar`)).json()
    expect(v.valido).toBe(false)
    expect(v.erros.map((e: { codigo: string }) => e.codigo)).toContain('acao_irreversivel_sem_confirmacao')
  })

  it('publicar grafo invalido: 422 grafo_invalido com o motivo; nada muda', async () => {
    const r = await chamar(donoA, lojaA, 'POST', `/${fluxoId}/rascunho/publicar`)
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('grafo_invalido')
    expect(r.json().error.message).toContain('acao_irreversivel_sem_confirmacao')
    const f = (await chamar(donoA, lojaA, 'GET', `/${fluxoId}`)).json()
    expect(f.publicada).toBeNull()
    expect(f.rascunho.status).toBe('rascunho')
  })

  it('ativar sem versao publicada: 422', async () => {
    const r = await chamar(donoA, lojaA, 'POST', `/${fluxoId}/ativar`)
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('sem_versao_publicada')
  })

  it('publica o grafo corrigido: v1 publicada, sem rascunho; republicar sem rascunho = 422', async () => {
    await chamar(donoA, lojaA, 'PUT', `/${fluxoId}/rascunho`, { grafo: FLUXO_PADRAO })
    const v = (await chamar(donoA, lojaA, 'POST', `/${fluxoId}/rascunho/validar`)).json()
    expect(v).toEqual({ valido: true, erros: [], avisos: [] })
    const r = await chamar(donoA, lojaA, 'POST', `/${fluxoId}/rascunho/publicar`)
    expect(r.statusCode).toBe(200)
    expect(r.json().publicada).toMatchObject({ versao: 1, status: 'publicada' })
    expect(r.json().publicada.publicada_em).toMatch(/Z$/)
    expect(r.json().rascunho).toBeNull()
    const de_novo = await chamar(donoA, lojaA, 'POST', `/${fluxoId}/rascunho/publicar`)
    expect(de_novo.statusCode).toBe(422)
    expect(de_novo.json().error.code).toBe('sem_rascunho')
  })

  it('nova edicao cria rascunho v2; publicar arquiva a v1 (duas publicacoes)', async () => {
    const g = structuredClone(FLUXO_PADRAO)
    g.nodes.find((n) => n.id === 'pagamento')!.config = { metodos: ['pix'] }
    const ed = await chamar(gerA, lojaA, 'PUT', `/${fluxoId}/rascunho`, { grafo: g })
    expect(ed.json().rascunho.versao).toBe(2)
    expect(ed.json().publicada.versao).toBe(1)
    const pub = await chamar(gerA, lojaA, 'POST', `/${fluxoId}/rascunho/publicar`)
    expect(pub.json().publicada.versao).toBe(2)
    const hist = (await chamar(atendA, lojaA, 'GET', `/${fluxoId}/versoes`)).json().itens
    expect(hist.map((v: { versao: number; status: string }) => `${v.versao}:${v.status}`)).toEqual([
      '2:publicada', '1:arquivada',
    ])
    const v1 = (await chamar(atendA, lojaA, 'GET', `/${fluxoId}/versoes/1`)).json()
    expect(v1.grafo).toEqual(FLUXO_PADRAO)
    expect((await chamar(atendA, lojaA, 'GET', `/${fluxoId}/versoes/99`)).statusCode).toBe(404)
  })

  it('restaurar a v1 cria rascunho v3 (nao reescreve a publicada); com rascunho aberto = 409', async () => {
    const r = await chamar(donoA, lojaA, 'POST', `/${fluxoId}/versoes/1/restaurar`)
    expect(r.statusCode).toBe(200)
    expect(r.json().rascunho).toMatchObject({ versao: 3, status: 'rascunho' })
    expect(r.json().rascunho.grafo).toEqual(FLUXO_PADRAO)
    expect(r.json().publicada.versao).toBe(2)
    const outra = await chamar(donoA, lojaA, 'POST', `/${fluxoId}/versoes/1/restaurar`)
    expect(outra.statusCode).toBe(409)
    expect(outra.json().error.code).toBe('rascunho_existente')
  })

  it('ativar: so um fluxo ativo por loja (o outro e desativado); desativar', async () => {
    const a = await chamar(donoA, lojaA, 'POST', `/${fluxoId}/ativar`)
    expect(a.statusCode).toBe(200)
    expect(a.json().ativo).toBe(true)
    const outro = (await chamar(donoA, lojaA, 'POST', '', { nome: 'Fluxo B' })).json().id
    await chamar(donoA, lojaA, 'POST', `/${outro}/rascunho/publicar`)
    const ativo2 = await chamar(donoA, lojaA, 'POST', `/${outro}/ativar`)
    expect(ativo2.json().ativo).toBe(true)
    expect((await chamar(donoA, lojaA, 'GET', `/${fluxoId}`)).json().ativo).toBe(false)
    const lista = (await chamar(donoA, lojaA, 'GET', '')).json().itens
    expect(lista.filter((f: { ativo: boolean }) => f.ativo)).toHaveLength(1)
    const off = await chamar(donoA, lojaA, 'POST', `/${outro}/desativar`)
    expect(off.json().ativo).toBe(false)
  })

  it('eventos de auditoria: sem o grafo e sem PII', async () => {
    const { rows } = await poolSuper.query<{ tipo: string; detalhes: Record<string, unknown> }>(
      `select tipo, detalhes from public.eventos where loja_id = $1 and entidade = 'fluxo'`, [lojaA],
    )
    const tipos = new Set(rows.map((r) => r.tipo))
    for (const t of ['fluxo.rascunho_criado', 'fluxo.publicado', 'fluxo.restaurado', 'fluxo.ativado']) {
      expect(tipos.has(t)).toBe(true)
    }
    for (const r of rows) expect(Object.keys(r.detalhes).every((k) => ['user_id', 'versao'].includes(k))).toBe(true)
  })

  it('trigger: grafo de versao publicada/arquivada nao muda; so publicada -> arquivada', async () => {
    const pub = await poolApi.query<{ id: string }>(
      `select id from public.fluxo_versoes where fluxo_id = $1 and status = 'publicada'`, [fluxoId],
    )
    await expect(
      poolApi.query(`update public.fluxo_versoes set grafo = '{}'::jsonb where id = $1`, [pub.rows[0]!.id]),
    ).rejects.toThrow(/imutavel/)
    const arq = await poolApi.query<{ id: string }>(
      `select id from public.fluxo_versoes where fluxo_id = $1 and status = 'arquivada'`, [fluxoId],
    )
    await expect(
      poolApi.query(`update public.fluxo_versoes set status = 'publicada' where id = $1`, [arq.rows[0]!.id]),
    ).rejects.toThrow()
  })

  it('privilegios: api sem DELETE; atendente so SELECT; zap sem acesso', async () => {
    await expect(poolApi.query('delete from public.fluxo_versoes')).rejects.toThrow(/permission denied|permiss.o negada/)
    await expect(poolApi.query('delete from public.fluxos')).rejects.toThrow(/permission denied|permiss.o negada/)
    const c = await poolSuper.connect()
    try {
      await c.query('begin')
      await c.query('set local role whaviso_atendente')
      const s = await c.query('select count(*)::int as n from public.fluxo_versoes')
      expect(s.rows[0].n).toBeGreaterThan(0)
      await expect(c.query(`update public.fluxos set nome = 'x'`)).rejects.toThrow(/permission denied|permiss.o negada/)
      await c.query('rollback')
      await c.query('begin')
      await c.query('set local role whaviso_zap')
      await expect(c.query('select 1 from public.fluxos')).rejects.toThrow(/permission denied|permiss.o negada/)
    } finally {
      await c.query('rollback').catch(() => {})
      c.release()
    }
  })
})
