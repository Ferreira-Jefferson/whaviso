// Integracao (Postgres local) dos eixos B e C do motor de autorizacao (item 14):
//  - C1: desligar `painel:ver` NAO expulsa o operador do console (sonda `/plataforma-painel/eu`);
//  - C2: NOTIFY/LISTEN invalida o cache da grade em outra instancia, sem esperar o TTL;
//  - B:  guards granulares (convidado le, nao escreve) e `GET /acessos/minhas` (C3 no servidor).
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyPluginAsync } from 'fastify'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { HOST, PORTA, SENHA_SUPER, bancoDoWorker } from '../../../../../test-support/banco'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { CANAL_GRADE, resetarGrade } from '../../shared/tenant'
import { criarPlataformaPainelRoutes } from '../plataforma_painel'
import { criarAcessosRoutes } from './routes'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

const urlDireta = `postgres://postgres:${encodeURIComponent(SENHA_SUPER)}@${HOST}:${PORTA}/${bancoDoWorker()}`

// Sondas: provam o guard central com as chaves novas (sem montar cada modulo inteiro).
const sonda: FastifyPluginAsync = async (app) => {
  for (const chave of ['cardapio:ver', 'cardapio:gerir', 'estoque_insumos:ver', 'estoque_insumos:gerir', 'conversas:ver'] as const) {
    app.get(`/${chave.replace(':', '-')}`, {
      config: { acesso: 'conteudo_de_loja' },
      preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao(chave)],
    }, async () => ({ ok: true }))
  }
  app.get('/funil-ver', {
    config: { acesso: 'plataforma' },
    preHandler: [app.autenticar, app.escopoOperador, app.exigirPermissao('funil:ver')],
  }, async () => ({ ok: true }))
}

async function esperar(cond: () => Promise<boolean>, ms = 4000): Promise<boolean> {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    if (await cond()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

d('acessos: granularidade e riscos eliminados', () => {
  const cenario = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let admin: string, suporte: string, convidado: string, atendente: string, dono: string
  let lojaA: string

  beforeAll(async () => {
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado', SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173', RATE_LIMIT_MAX: '100000',
    })
    admin = await criarUsuario(cenario)
    suporte = await criarUsuario(cenario)
    dono = await criarUsuario(cenario)
    convidado = await criarUsuario(cenario)
    atendente = await criarUsuario(cenario)
    const conta = await criarConta(cenario, dono)
    lojaA = await criarLoja(conta)
    await criarMembro(conta, dono, 'dono', null)
    await criarMembro(conta, atendente, 'atendente', lojaA)
    await poolSuper.query(
      `insert into public.membros (id, conta_id, loja_id, user_id, papel, ativo) values ($1, $2, $3, $4, 'convidado', true)`,
      [randomUUID(), conta, lojaA, convidado],
    )
    await criarOperador(admin, 'admin')
    await poolSuper.query(
      `insert into public.operadores (id, user_id, nome, papel) values ($1, $2, 'Suporte de teste', 'suporte')`,
      [randomUUID(), suporte],
    )
    app = await construirApp({
      env, pool: poolApi, logger: false, verificador: verificadorFake,
      modulos: [
        { prefixo: 'acessos', plugin: criarAcessosRoutes({ urlEscuta: urlDireta }) },
        { prefixo: 'plataforma-painel', plugin: criarPlataformaPainelRoutes() },
        { prefixo: 'sonda', plugin: sonda },
      ],
    })
    await app.ready()
  })

  afterAll(async () => {
    if (app) await app.close()
    resetarGrade()
    // Restaura os padroes que os testes mexeram.
    await poolSuper.query(
      `update public.papel_permissoes set permitido = (permissao_chave = 'painel:ver')
        where escopo = 'console' and papel = 'suporte' and permissao_chave in ('painel:ver', 'funil:ver')`,
    )
    await poolSuper.query(
      `update public.papel_permissoes set permitido = false
        where escopo = 'loja' and papel = 'convidado' and permissao_chave = 'lojas:gerir'`,
    )
    await poolSuper.query(`delete from public.eventos where entidade = 'papel_permissao' and detalhes->>'por_user_id' = $1`, [admin])
    await limpar(cenario)
    await fecharPools()
  })

  async function api(token: string | undefined, metodo: 'GET' | 'PATCH', url: string, corpo?: unknown, extra: Record<string, string> = {}) {
    const res = await app.inject({
      method: metodo, url,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
      ...(corpo === undefined ? {} : { payload: corpo as object }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
    return { status: res.statusCode, corpo: (res.body ? res.json() : null) as any }
  }
  const celula = (papel: string, permissao: string, permitido: boolean) =>
    api(admin, 'PATCH', '/v1/acessos/grade', { escopo: 'console', papel, permissao, permitido })

  it('C1: desligar painel:ver NAO expulsa o operador do console (so esconde o conteudo do painel)', async () => {
    expect((await api(suporte, 'GET', '/v1/plataforma-painel/eu')).status).toBe(200)
    expect((await celula('suporte', 'painel:ver', false)).status).toBe(200)
    // A sonda de identidade segue 200: ser operador e fato (vinculo), nao permissao editavel.
    const eu = await api(suporte, 'GET', '/v1/plataforma-painel/eu')
    expect(eu.status).toBe(200)
    expect(eu.corpo).toEqual({ operador: true, papel: 'suporte' })
    // O CONTEUDO do painel, sim, e gateado por painel:ver.
    expect((await api(suporte, 'GET', '/v1/plataforma-painel/resumo')).status).toBe(403)
    // Religar devolve o acesso ao conteudo.
    expect((await celula('suporte', 'painel:ver', true)).status).toBe(200)
    expect((await api(suporte, 'GET', '/v1/plataforma-painel/resumo')).status).toBe(200)
  })

  it('C1: a sonda continua restrita a operadores (401 sem token, 403 para membro de loja)', async () => {
    expect((await api(undefined, 'GET', '/v1/plataforma-painel/eu')).status).toBe(401)
    for (const quem of [dono, atendente, convidado]) {
      expect((await api(quem, 'GET', '/v1/plataforma-painel/eu')).status).toBe(403)
    }
  })

  it('C2: NOTIFY invalida o cache em OUTRA instancia sem esperar o TTL', async () => {
    // Aquece o cache deste processo (suporte sem funil:ver).
    expect((await api(suporte, 'GET', '/v1/sonda/funil-ver')).status).toBe(403)
    // "Outra instancia" grava direto no banco (este processo NAO sabe): o cache ainda esta velho.
    await poolSuper.query(
      `update public.papel_permissoes set permitido = true
        where escopo = 'console' and papel = 'suporte' and permissao_chave = 'funil:ver'`,
    )
    expect((await api(suporte, 'GET', '/v1/sonda/funil-ver')).status).toBe(403)
    // O NOTIFY (emitido por quem salvou) chega via LISTEN e derruba o cache. A conexao LISTEN pode
    // ainda estar abrindo: reemite ate refletir (sempre muito abaixo do TTL de 30s).
    const t0 = Date.now()
    const refletiu = await esperar(async () => {
      await poolSuper.query('select pg_notify($1, $2)', [CANAL_GRADE, ''])
      return (await api(suporte, 'GET', '/v1/sonda/funil-ver')).status === 200
    })
    expect(refletiu).toBe(true)
    expect(Date.now() - t0).toBeLessThan(10_000)
    await poolSuper.query(
      `update public.papel_permissoes set permitido = false
        where escopo = 'console' and papel = 'suporte' and permissao_chave = 'funil:ver'`,
    )
    await poolSuper.query('select pg_notify($1, $2)', [CANAL_GRADE, ''])
    expect(await esperar(async () => (await api(suporte, 'GET', '/v1/sonda/funil-ver')).status === 403)).toBe(true)
  })

  it('C2: salvar a grade pela api emite NOTIFY no canal (as demais instancias ouvem)', async () => {
    const ouvinte = new pg.Client({ connectionString: urlDireta })
    await ouvinte.connect()
    const recebidos: string[] = []
    ouvinte.on('notification', (m) => recebidos.push(m.channel))
    await ouvinte.query(["LISTEN", ouvinte.escapeIdentifier(CANAL_GRADE)].join(" "))
    try {
      expect((await celula('suporte', 'funil:ver', true)).status).toBe(200)
      expect(await esperar(async () => recebidos.includes(CANAL_GRADE))).toBe(true)
      // Efeito imediato tambem no processo que salvou.
      expect((await api(suporte, 'GET', '/v1/sonda/funil-ver')).status).toBe(200)
    } finally {
      await celula('suporte', 'funil:ver', false)
      await ouvinte.end()
    }
  })

  it('B: convidado le cardapio e estoque, nao altera; atendente le cardapio mas nao gere', async () => {
    const h = { 'x-loja-id': lojaA }
    expect((await api(convidado, 'GET', '/v1/sonda/cardapio-ver', undefined, h)).status).toBe(200)
    expect((await api(convidado, 'GET', '/v1/sonda/estoque_insumos-ver', undefined, h)).status).toBe(200)
    expect((await api(convidado, 'GET', '/v1/sonda/cardapio-gerir', undefined, h)).status).toBe(403)
    expect((await api(convidado, 'GET', '/v1/sonda/estoque_insumos-gerir', undefined, h)).status).toBe(403)
    expect((await api(convidado, 'GET', '/v1/sonda/conversas-ver', undefined, h)).status).toBe(403)
    expect((await api(atendente, 'GET', '/v1/sonda/cardapio-ver', undefined, h)).status).toBe(200)
    expect((await api(atendente, 'GET', '/v1/sonda/cardapio-gerir', undefined, h)).status).toBe(403)
    expect((await api(atendente, 'GET', '/v1/sonda/conversas-ver', undefined, h)).status).toBe(200)
    for (const chave of ['cardapio-ver', 'cardapio-gerir', 'estoque_insumos-gerir']) {
      expect((await api(dono, 'GET', `/v1/sonda/${chave}`, undefined, h)).status, chave).toBe(200)
    }
  })

  it('C3 (servidor): /acessos/minhas descreve o que o usuario pode em cada loja, e acompanha a grade', async () => {
    const eu = async (quem: string) => (await api(quem, 'GET', '/v1/acessos/minhas')).corpo.por_loja[lojaA] as string[]
    expect(await eu(convidado)).not.toContain('lojas:gerir')
    expect(await eu(convidado)).toContain('cardapio:ver')
    expect(await eu(atendente)).not.toContain('lojas:gerir')
    expect(await eu(dono)).toContain('lojas:gerir')
    expect((await api(undefined, 'GET', '/v1/acessos/minhas')).status).toBe(401)
    const editar = (permitido: boolean) =>
      api(admin, 'PATCH', '/v1/acessos/grade', { escopo: 'loja', papel: 'convidado', permissao: 'lojas:gerir', permitido })
    expect((await editar(true)).status).toBe(200)
    try {
      expect(await eu(convidado)).toContain('lojas:gerir')
    } finally {
      await editar(false)
    }
    expect(await eu(convidado)).not.toContain('lojas:gerir')
  })
})
