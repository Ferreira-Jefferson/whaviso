// Integracao do motor de autorizacao editavel (item 14) contra o Postgres local: paridade
// catalogo TS x migration 0072, edicao da grade pela API com efeito imediato, anti-lockout
// (no service e por CHECK no banco) e sem DELETE.
import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyPluginAsync } from 'fastify'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { CATALOGO, PAPEIS_CONSOLE, PAPEIS_LOJA, padraoPermite, resetarGrade } from '../../shared/tenant'
import { criarAcessosRoutes } from './routes'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

// Sondas: provam o guard central com a grade viva (uma chave de console e duas de loja).
const sonda: FastifyPluginAsync = async (app) => {
  app.get('/funil-ver', {
    config: { acesso: 'plataforma' },
    preHandler: [app.autenticar, app.escopoOperador, app.exigirPermissao('funil:ver')],
  }, async () => ({ ok: true }))
  app.get('/pedidos-gerir', {
    config: { acesso: 'conteudo_de_loja' },
    preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')],
  }, async () => ({ ok: true }))
  app.get('/pedidos-ver', {
    config: { acesso: 'conteudo_de_loja' },
    preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:ver')],
  }, async () => ({ ok: true }))
}

d('modulo acessos (grade editavel)', () => {
  const cenario = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let admin: string, operador: string, suporte: string
  let dono: string, convidado: string, atendente: string
  let lojaA: string

  beforeAll(async () => {
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado', SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173', RATE_LIMIT_MAX: '100000',
    })
    admin = await criarUsuario(cenario)
    operador = await criarUsuario(cenario)
    suporte = await criarUsuario(cenario)
    dono = await criarUsuario(cenario)
    convidado = await criarUsuario(cenario)
    atendente = await criarUsuario(cenario)
    const conta = await criarConta(cenario, dono)
    lojaA = await criarLoja(conta)
    await criarMembro(conta, dono, 'dono', null)
    await criarMembro(conta, atendente, 'atendente', lojaA)
    await poolSuper.query(
      `insert into public.membros (id, conta_id, loja_id, user_id, papel, ativo)
       values ($1, $2, $3, $4, 'convidado', true)`,
      [randomUUID(), conta, lojaA, convidado],
    )
    await criarOperador(admin, 'admin')
    await criarOperador(operador, 'operador')
    await poolSuper.query(
      `insert into public.operadores (id, user_id, nome, papel) values ($1, $2, 'Suporte de teste', 'suporte')`,
      [randomUUID(), suporte],
    )
    app = await construirApp({
      env, pool: poolApi, logger: false, verificador: verificadorFake,
      modulos: [
        { prefixo: 'acessos', plugin: criarAcessosRoutes() },
        { prefixo: 'sonda', plugin: sonda },
      ],
    })
    await app.ready()
  })

  afterAll(async () => {
    if (app) await app.close()
    resetarGrade()
    // Restaura a grade para os padroes (testes mexem em celulas) e limpa a auditoria do teste.
    for (const p of CATALOGO) {
      const papeis = p.escopo === 'console' ? PAPEIS_CONSOLE : PAPEIS_LOJA
      for (const papel of papeis) {
        await poolSuper.query(
          `update public.papel_permissoes set permitido = $4
            where escopo = $1 and papel = $2 and permissao_chave = $3`,
          [p.escopo, papel, p.chave, padraoPermite(p.escopo, papel, p.chave)],
        )
      }
    }
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
  const celula = (escopo: string, papel: string, permissao: string, permitido: boolean) =>
    api(admin, 'PATCH', '/v1/acessos/grade', { escopo, papel, permissao, permitido })
  const comoLoja = { 'x-loja-id': '' }

  it('paridade: catalogo e grade semeados na migration == catalogo TS (padroes)', async () => {
    const perms = await poolSuper.query<{ chave: string; escopo: string; rotulo: string; ordem: number }>(
      'select chave, escopo, rotulo, ordem from public.permissoes order by chave',
    )
    expect(perms.rows).toEqual(
      CATALOGO.map((p) => ({ chave: p.chave, escopo: p.escopo, rotulo: p.rotulo, ordem: p.ordem }))
        .sort((a, b) => (a.chave < b.chave ? -1 : 1)),
    )
    const grade = await poolSuper.query<{ escopo: string; papel: string; permissao_chave: string; permitido: boolean }>(
      'select escopo, papel, permissao_chave, permitido from public.papel_permissoes',
    )
    expect(grade.rows).toHaveLength(12 * PAPEIS_CONSOLE.length + 20 * PAPEIS_LOJA.length)
    for (const l of grade.rows) {
      expect(l.permitido, `${l.escopo}/${l.papel}/${l.permissao_chave}`).toBe(padraoPermite(l.escopo as 'console' | 'loja', l.papel, l.permissao_chave))
    }
  })

  it('so admin le e edita a grade (401, 403 operador/suporte/membro de loja)', async () => {
    expect((await api(undefined, 'GET', '/v1/acessos')).status).toBe(401)
    for (const quem of [operador, suporte, dono, atendente]) {
      expect((await api(quem, 'GET', '/v1/acessos')).status).toBe(403)
      const r = await api(quem, 'PATCH', '/v1/acessos/grade', { escopo: 'console', papel: 'suporte', permissao: 'funil:ver', permitido: true })
      expect(r.status).toBe(403)
    }
    const ok = await api(admin, 'GET', '/v1/acessos')
    expect(ok.status).toBe(200)
    expect(ok.corpo.grade).toHaveLength(12 * 5 + 20 * 4)
    expect(ok.corpo.fixos).toEqual({ console: 'admin', loja: 'dono' })
    expect(ok.corpo.permissoes.find((p: { chave: string }) => p.chave === 'acessos:gerir').travada).toBe(true)
  })

  it('edicao do console vale na hora e e reversivel; grava auditoria so com ids', async () => {
    expect((await api(suporte, 'GET', '/v1/sonda/funil-ver')).status).toBe(403)
    const r = await celula('console', 'suporte', 'funil:ver', true)
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect((await api(suporte, 'GET', '/v1/sonda/funil-ver')).status).toBe(200)
    // operador (padrao com funil:ver) segue igual
    expect((await api(operador, 'GET', '/v1/sonda/funil-ver')).status).toBe(200)
    const lido = await api(admin, 'GET', '/v1/acessos')
    expect(lido.corpo.grade.find((c: { papel: string; permissao: string }) => c.papel === 'suporte' && c.permissao === 'funil:ver').permitido).toBe(true)

    await celula('console', 'suporte', 'funil:ver', false)
    expect((await api(suporte, 'GET', '/v1/sonda/funil-ver')).status).toBe(403)

    const ev = await poolSuper.query(
      `select detalhes from public.eventos where tipo = 'plataforma.acesso_alterado' and detalhes->>'por_user_id' = $1 order by id`,
      [admin],
    )
    expect(ev.rows.length).toBeGreaterThanOrEqual(2)
    expect(Object.keys(ev.rows[0].detalhes).sort()).toEqual(['de', 'escopo', 'papel', 'para', 'permissao', 'por_user_id'])
  })

  it('edicao da loja vale na hora: convidado ganha e perde pedidos:gerir; atendente intacto', async () => {
    const h = { ...comoLoja, 'x-loja-id': lojaA }
    expect((await api(convidado, 'GET', '/v1/sonda/pedidos-ver', undefined, h)).status).toBe(200)
    expect((await api(convidado, 'GET', '/v1/sonda/pedidos-gerir', undefined, h)).status).toBe(403)
    expect((await celula('loja', 'convidado', 'pedidos:gerir', true)).status).toBe(200)
    expect((await api(convidado, 'GET', '/v1/sonda/pedidos-gerir', undefined, h)).status).toBe(200)
    expect((await celula('loja', 'convidado', 'pedidos:gerir', false)).status).toBe(200)
    expect((await api(convidado, 'GET', '/v1/sonda/pedidos-gerir', undefined, h)).status).toBe(403)
    expect((await api(atendente, 'GET', '/v1/sonda/pedidos-gerir', undefined, h)).status).toBe(200)
    expect((await api(dono, 'GET', '/v1/sonda/pedidos-gerir', undefined, h)).status).toBe(200)
  })

  it('anti-lockout: admin e dono nao sao editaveis; acessos:gerir nao e delegavel; admin segue com acesso', async () => {
    expect((await celula('console', 'admin', 'acessos:gerir', false)).corpo.error.code).toBe('papel_fixo')
    expect((await celula('console', 'admin', 'funil:ver', false)).status).toBe(422)
    expect((await celula('loja', 'dono', 'pedidos:gerir', false)).corpo.error.code).toBe('papel_fixo')
    expect((await celula('console', 'operador', 'acessos:gerir', true)).corpo.error.code).toBe('permissao_travada')
    expect((await celula('console', 'financeiro', 'acessos:gerir', true)).status).toBe(422)
    expect((await api(admin, 'GET', '/v1/acessos')).status).toBe(200)
    // O banco tambem barra (defesa em profundidade): nenhum caminho de SQL tira o acesso do admin.
    await expect(poolSuper.query(
      `update public.papel_permissoes set permitido = false where escopo='console' and papel='admin' and permissao_chave='acessos:gerir'`,
    )).rejects.toThrow()
    await expect(poolSuper.query(
      `update public.papel_permissoes set permitido = false where escopo='loja' and papel='dono' and permissao_chave='pedidos:gerir'`,
    )).rejects.toThrow()
    await expect(poolSuper.query(
      `update public.papel_permissoes set permitido = true where escopo='console' and papel='operador' and permissao_chave='acessos:gerir'`,
    )).rejects.toThrow()
  })

  it('validacao: escopo/papel/permissao invalidos e corpo com campo extra (loja_id)', async () => {
    expect((await celula('loja', 'operador', 'pedidos:gerir', true)).corpo.error.code).toBe('papel_invalido')
    expect((await celula('console', 'gerente', 'funil:ver', true)).corpo.error.code).toBe('papel_invalido')
    expect((await celula('loja', 'gerente', 'funil:ver', true)).corpo.error.code).toBe('escopo_invalido')
    expect((await celula('loja', 'gerente', 'nao:existe', true)).status).toBe(404)
    const extra = await api(admin, 'PATCH', '/v1/acessos/grade', {
      escopo: 'loja', papel: 'gerente', permissao: 'pedidos:gerir', permitido: true, loja_id: lojaA,
    })
    expect(extra.status).toBe(400)
  })

  it('whaviso_api nao tem DELETE na grade nem no catalogo', async () => {
    await expect(poolApi.query('delete from public.papel_permissoes')).rejects.toThrow()
    await expect(poolApi.query('delete from public.permissoes')).rejects.toThrow()
  })
})
