// Integracao de chaves_api contra o Postgres local: emissao (valor so uma vez), listagem mascarada,
// revogacao soft, e autenticacao por chave (valida, revogada, vencida, cross-conta, plataforma).
import { Writable } from 'node:stream'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyPluginAsync } from 'fastify'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarChavesApiRoutes } from './routes'
import { sha256Hex } from '../../shared/tokens'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

// Rota de conteudo de loja, so para provar a credencial por chave + escopo de loja.
const sonda: FastifyPluginAsync = async (app) => {
  app.get('/loja', {
    config: { acesso: 'conteudo_de_loja' },
    preHandler: [app.autenticar, app.escopoLoja],
  }, async (req) => ({ conta_id: req.escopo?.conta_id, loja_ativa: req.escopo?.loja_ativa, via_chave: req.chaveApi !== null }))
  // Rota de plataforma exposta so no teste, para provar que a chave nao entra.
  app.get('/plat', {
    config: { acesso: 'plataforma' },
    preHandler: [app.autenticar, app.escopoOperador],
  }, async () => ({ ok: true }))
}

d('modulo chaves_api', () => {
  const logs: string[] = []
  const cenario = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let admin: string, operador: string, dono: string, donoB: string
  let contaA: string, contaB: string, lojaA: string, lojaB: string

  beforeAll(async () => {
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado', SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173', RATE_LIMIT_MAX: '100000',
    })
    admin = await criarUsuario(cenario)
    operador = await criarUsuario(cenario)
    dono = await criarUsuario(cenario)
    donoB = await criarUsuario(cenario)
    contaA = await criarConta(cenario, dono)
    contaB = await criarConta(cenario, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaB, donoB, 'dono', null)
    await criarOperador(admin, 'admin')
    await criarOperador(operador, 'operador')
    const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })
    app = await construirApp({
      env, pool: poolApi, logger: criarLogger('chaves-api-teste', 'info', destino), verificador: verificadorFake,
      modulos: [
        { prefixo: 'chaves-api', plugin: criarChavesApiRoutes() },
        { prefixo: 'sonda', plugin: sonda },
      ],
    })
    await app.ready()
  })
  afterAll(async () => {
    if (app) await app.close()
    await poolSuper.query('delete from public.eventos where entidade = $1 and detalhes->>$2 = any($3)', [
      'chave_api', 'por_user_id', [admin, operador],
    ])
    await limpar(cenario) // chaves_api cascateia da conta
    await fecharPools()
  })

  const como = (t?: string) => (t ? { authorization: `Bearer ${t}` } : {})
  async function api(token: string | undefined, metodo: 'GET' | 'POST', url: string, corpo?: unknown, extra: Record<string, string> = {}) {
    const res = await app.inject({
      method: metodo, url, headers: { ...como(token), ...extra },
      ...(corpo === undefined ? {} : { payload: corpo as object }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
    return { status: res.statusCode, corpo: (res.body ? res.json() : null) as any }
  }
  const criar = (conta: string, corpo: unknown = { nome: 'Integracao' }) =>
    api(admin, 'POST', `/v1/chaves-api/contas/${conta}/chaves`, corpo)

  it('so admin da plataforma gere chaves (401 sem token, 403 operador e membro)', async () => {
    const url = `/v1/chaves-api/contas/${contaA}/chaves`
    expect((await api(undefined, 'GET', url)).status).toBe(401)
    for (const quem of [operador, dono]) {
      expect((await api(quem, 'GET', url)).status).toBe(403)
      expect((await api(quem, 'POST', url, { nome: 'x' })).status).toBe(403)
    }
  })

  it('cria devolvendo o valor completo uma vez; banco guarda so hash; listagem mascarada', async () => {
    const r = await criar(contaA, { nome: 'ERP' })
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    const valor: string = r.corpo.valor
    expect(valor).toMatch(/^whv_live_[A-Za-z0-9_-]{43}$/)
    expect(r.corpo.chave).toMatchObject({ nome: 'ERP', situacao: 'ativa', expira_em: null, revogada_em: null })
    expect(r.corpo.chave.mascara).toBe(`${valor.slice(0, 13)}...${valor.slice(-4)}`)

    const { rows } = await poolSuper.query('select * from public.chaves_api where id = $1', [r.corpo.chave.id])
    expect(rows[0].hash_sha256).toBe(sha256Hex(valor))
    expect(JSON.stringify(rows[0])).not.toContain(valor)

    const l = await api(admin, 'GET', `/v1/chaves-api/contas/${contaA}/chaves`)
    expect(l.status).toBe(200)
    const item = l.corpo.itens.find((x: { id: string }) => x.id === r.corpo.chave.id)
    expect(Object.keys(item).sort()).toEqual(
      ['criado_em', 'expira_em', 'id', 'mascara', 'nome', 'prefixo', 'revogada_em', 'situacao', 'ultimos4'],
    )
    expect(JSON.stringify(l.corpo)).not.toContain(valor)
    expect(JSON.stringify(l.corpo)).not.toContain(sha256Hex(valor))
    // o valor nunca vai para o log
    expect(logs.join('')).not.toContain(valor)
  })

  it('validacao: nome obrigatorio, validade no passado e campos extras (loja_id) rejeitados', async () => {
    expect((await criar(contaA, { nome: '' })).status).toBe(400)
    expect((await criar(contaA, { nome: 'x', loja_id: lojaA })).status).toBe(400)
    expect((await criar(contaA, { nome: 'x', expira_em: '2020-01-01T00:00:00Z' })).status).toBe(422)
    expect((await criar('00000000-0000-4000-8000-000000000000')).status).toBe(404)
  })

  it('revoga SOFT: seta revogada_em, linha continua, idempotente, escopada pela conta', async () => {
    const r = await criar(contaA, { nome: 'revogar' })
    const id = r.corpo.chave.id
    // conta errada na rota nao revoga (404)
    expect((await api(admin, 'POST', `/v1/chaves-api/contas/${contaB}/chaves/${id}/revogar`)).status).toBe(404)
    const v = await api(admin, 'POST', `/v1/chaves-api/contas/${contaA}/chaves/${id}/revogar`)
    expect(v.status).toBe(200)
    expect(v.corpo).toMatchObject({ situacao: 'revogada' })
    const primeira = v.corpo.revogada_em
    const de_novo = await api(admin, 'POST', `/v1/chaves-api/contas/${contaA}/chaves/${id}/revogar`)
    expect(de_novo.corpo.revogada_em).toBe(primeira)
    const { rows } = await poolSuper.query('select revogada_em from public.chaves_api where id = $1', [id])
    expect(rows).toHaveLength(1)
    expect(rows[0].revogada_em).not.toBeNull()
    // sem DELETE para o role da api (SEC-030)
    await expect(poolApi.query('delete from public.chaves_api where id = $1', [id])).rejects.toThrow()
  })

  it('auth por chave: aceita valida (conta dona + loja da conta); 401 em invalida/revogada/vencida', async () => {
    const r = await criar(contaA, { nome: 'auth' })
    const valor: string = r.corpo.valor
    const ok = await api(valor, 'GET', '/v1/sonda/loja', undefined, { 'x-loja-id': lojaA })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(200)
    expect(ok.corpo).toEqual({ conta_id: contaA, loja_ativa: lojaA, via_chave: true })

    expect((await api('whv_live_naoexiste', 'GET', '/v1/sonda/loja', undefined, { 'x-loja-id': lojaA })).status).toBe(401)
    expect((await api(`${valor}x`, 'GET', '/v1/sonda/loja')).status).toBe(401)

    // vencida
    await poolSuper.query("update public.chaves_api set expira_em = now() - interval '1 minute' where id = $1", [r.corpo.chave.id])
    expect((await api(valor, 'GET', '/v1/sonda/loja', undefined, { 'x-loja-id': lojaA })).status).toBe(401)
    const lista = await api(admin, 'GET', `/v1/chaves-api/contas/${contaA}/chaves`)
    expect(lista.corpo.itens.find((x: { id: string }) => x.id === r.corpo.chave.id).situacao).toBe('expirada')

    // com validade futura volta a valer; revogada passa a 401
    await poolSuper.query("update public.chaves_api set expira_em = now() + interval '1 day' where id = $1", [r.corpo.chave.id])
    expect((await api(valor, 'GET', '/v1/sonda/loja', undefined, { 'x-loja-id': lojaA })).status).toBe(200)
    await api(admin, 'POST', `/v1/chaves-api/contas/${contaA}/chaves/${r.corpo.chave.id}/revogar`)
    expect((await api(valor, 'GET', '/v1/sonda/loja', undefined, { 'x-loja-id': lojaA })).status).toBe(401)
  })

  it('chave NAO cruza conta: loja de outra conta = 404; sem x-loja-id fica na propria conta', async () => {
    const r = await criar(contaA, { nome: 'cross' })
    const valor: string = r.corpo.valor
    const cruz = await api(valor, 'GET', '/v1/sonda/loja', undefined, { 'x-loja-id': lojaB })
    expect(cruz.status).toBe(404)
    const sem = await api(valor, 'GET', '/v1/sonda/loja')
    expect(sem.status).toBe(200)
    expect(sem.corpo.conta_id).toBe(contaA)
    // chave da conta B nao enxerga loja A
    const rb = await criar(contaB, { nome: 'b' })
    expect((await api(rb.corpo.valor, 'GET', '/v1/sonda/loja', undefined, { 'x-loja-id': lojaA })).status).toBe(404)
  })

  it('chave nunca autentica rota de plataforma (nem emite chave); JWT segue funcionando', async () => {
    const r = await criar(contaA, { nome: 'plat' })
    const valor: string = r.corpo.valor
    expect((await api(valor, 'GET', '/v1/sonda/plat')).status).toBe(403)
    expect((await api(valor, 'POST', `/v1/chaves-api/contas/${contaA}/chaves`, { nome: 'x' })).status).toBe(403)
    expect((await api(admin, 'GET', '/v1/sonda/plat')).status).toBe(200) // caminho JWT intacto
    expect((await api(dono, 'GET', '/v1/sonda/loja', undefined, { 'x-loja-id': lojaA })).corpo.via_chave).toBe(false)
  })
})
