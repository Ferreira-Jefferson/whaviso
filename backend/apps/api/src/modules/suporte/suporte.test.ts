// Integracao + seguranca do modulo `suporte` e do kernel `shared/acesso_suporte`. Roda no Postgres
// LOCAL (banco por worker, ver backend/test-support). Pula com aviso se o banco nao estiver acessivel.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { verificadorFake } from '../../../test/app'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools,
  limpar, novoCenario, poolApi, poolSuper, type Cenario,
} from '../../../test/db'
import { servicoAcessoSuporte } from '../../shared/acesso_suporte'
import { suporteRoutes, plataformaSuporteRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_DESLIGADO: 'true',
})

let disponivel = false

async function montarApp() {
  return construirApp({
    env, pool: poolApi, logger: false, verificador: verificadorFake,
    modulos: [
      { prefixo: 'suporte', plugin: suporteRoutes },
      { prefixo: 'plataforma-suporte', plugin: plataformaSuporteRoutes },
    ],
  })
}

type Papel = 'dono' | 'gerente' | 'atendente'
interface LojaFix { cenario: Cenario; userId: string; contaId: string; lojaId: string }

async function seedLoja(papel: Papel): Promise<LojaFix> {
  const cenario = novoCenario()
  const userId = await criarUsuario(cenario)
  const contaId = await criarConta(cenario, userId)
  const lojaId = await criarLoja(contaId)
  await criarMembro(contaId, userId, papel, lojaId)
  return { cenario, userId, contaId, lojaId }
}

/** Operador com papel de console arbitrario (criarOperador do helper so faz operador/admin). */
async function seedOperador(papel: 'operador' | 'admin' | 'convidado'): Promise<{ cenario: Cenario; userId: string }> {
  const cenario = novoCenario()
  const userId = await criarUsuario(cenario)
  if (papel === 'convidado') {
    await poolSuper.query(
      "insert into public.operadores (id, user_id, nome, papel) values ($1,$2,'Op','convidado')",
      [randomUUID(), userId],
    )
  } else {
    await criarOperador(userId, papel)
  }
  return { cenario, userId }
}

const authLoja = (userId: string, lojaId: string) => ({ authorization: `Bearer ${userId}`, 'x-loja-id': lojaId })
const authOp = (userId: string) => ({ authorization: `Bearer ${userId}` })

const cenarios: Cenario[] = []
function reg<T extends { cenario: Cenario }>(f: T): T { cenarios.push(f.cenario); return f }

beforeAll(async () => {
  disponivel = await bancoAcessivel()
  if (!disponivel) console.warn('[suporte] banco indisponivel: testes de integracao pulados')
})
afterAll(fecharPools)
afterEach(async () => { for (const c of cenarios.splice(0)) await limpar(c) })

describe('LOJA: chamados', () => {
  it('abre chamado, lista, detalha e manda mensagem (status volta a aberto)', async () => {
    if (!disponivel) return
    const f = reg(await seedLoja('gerente'))
    const app = await montarApp()
    const h = authLoja(f.userId, f.lojaId)

    const abrir = await app.inject({ method: 'POST', url: '/v1/suporte/chamados', headers: h, payload: { assunto: 'Nao recebo pedidos', mensagem: 'Oi, meu numero parou' } })
    expect(abrir.statusCode, abrir.body).toBe(201)
    const chamado = abrir.json()
    expect(chamado).toMatchObject({ loja_id: f.lojaId, status: 'aberto', assunto: 'Nao recebo pedidos' })

    const lista = await app.inject({ method: 'GET', url: '/v1/suporte/chamados', headers: h })
    expect(lista.json().itens.map((c: { id: string }) => c.id)).toContain(chamado.id)

    const ficha = await app.inject({ method: 'GET', url: `/v1/suporte/chamados/${chamado.id}`, headers: h })
    expect(ficha.statusCode).toBe(200)
    expect(ficha.json().mensagens).toHaveLength(1)
    expect(ficha.json().mensagens[0]).toMatchObject({ autor_tipo: 'loja', texto: 'Oi, meu numero parou' })

    const msg = await app.inject({ method: 'POST', url: `/v1/suporte/chamados/${chamado.id}/mensagens`, headers: h, payload: { texto: 'Alguma novidade?' } })
    expect(msg.statusCode, msg.body).toBe(201)
    expect(msg.json().autor_tipo).toBe('loja')
    const ficha2 = await app.inject({ method: 'GET', url: `/v1/suporte/chamados/${chamado.id}`, headers: h })
    expect(ficha2.json().chamado.status).toBe('aberto')
    expect(ficha2.json().mensagens).toHaveLength(2)

    const patch = await app.inject({ method: 'PATCH', url: `/v1/suporte/chamados/${chamado.id}`, headers: h, payload: { status: 'resolvido' } })
    expect(patch.json().status).toBe('resolvido')
    await app.close()
  })

  it('atendente (sem suporte_loja:gerir) recebe 403', async () => {
    if (!disponivel) return
    const f = reg(await seedLoja('atendente'))
    const app = await montarApp()
    const r = await app.inject({ method: 'GET', url: '/v1/suporte/chamados', headers: authLoja(f.userId, f.lojaId) })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('loja_id no corpo e rejeitado (SEC-002, strictObject)', async () => {
    if (!disponivel) return
    const f = reg(await seedLoja('gerente'))
    const app = await montarApp()
    const r = await app.inject({ method: 'POST', url: '/v1/suporte/chamados', headers: authLoja(f.userId, f.lojaId), payload: { assunto: 'x', mensagem: 'y', loja_id: f.lojaId } })
    await app.close()
    expect(r.statusCode).toBe(400)
  })

  it('loja B nao acessa chamado da loja A (SEC-001 => 404)', async () => {
    if (!disponivel) return
    const a = reg(await seedLoja('gerente'))
    const b = reg(await seedLoja('gerente'))
    const app = await montarApp()
    const abrir = await app.inject({ method: 'POST', url: '/v1/suporte/chamados', headers: authLoja(a.userId, a.lojaId), payload: { assunto: 'a', mensagem: 'a' } })
    const chamadoA = abrir.json().id
    // user de B pedindo a loja de A no header => escopoLoja ja da 404
    const r1 = await app.inject({ method: 'GET', url: `/v1/suporte/chamados/${chamadoA}`, headers: authLoja(b.userId, a.lojaId) })
    expect(r1.statusCode).toBe(404)
    // user de B, loja de B, mas id de chamado de A => 404 (isolamento por loja no service)
    const r2 = await app.inject({ method: 'GET', url: `/v1/suporte/chamados/${chamadoA}`, headers: authLoja(b.userId, b.lojaId) })
    expect(r2.statusCode).toBe(404)
    await app.close()
  })
})

describe('LOJA: acesso assistido (consentimento)', () => {
  it('concede por duracao, lista e revoga (idempotente); ativo reflete o estado', async () => {
    if (!disponivel) return
    const f = reg(await seedLoja('gerente'))
    const app = await montarApp()
    const h = authLoja(f.userId, f.lojaId)

    const conc = await app.inject({ method: 'POST', url: '/v1/suporte/acessos', headers: h, payload: { duracao_horas: 24, motivo: 'investigar numero' } })
    expect(conc.statusCode, conc.body).toBe(201)
    const grant = conc.json()
    expect(grant).toMatchObject({ loja_id: f.lojaId, ativo: true, motivo: 'investigar numero', revogado_em: null })

    const lista = await app.inject({ method: 'GET', url: '/v1/suporte/acessos', headers: h })
    expect(lista.json().itens.map((g: { id: string }) => g.id)).toContain(grant.id)

    // kernel: ha acesso ativo?
    expect(await servicoAcessoSuporte.acessoAtivo(poolApi, f.lojaId)).not.toBeNull()

    const rev1 = await app.inject({ method: 'POST', url: `/v1/suporte/acessos/${grant.id}/revogar`, headers: h })
    expect(rev1.statusCode).toBe(200)
    expect(rev1.json()).toMatchObject({ ativo: false })
    expect(rev1.json().revogado_em).not.toBeNull()
    // idempotente
    const rev2 = await app.inject({ method: 'POST', url: `/v1/suporte/acessos/${grant.id}/revogar`, headers: h })
    expect(rev2.statusCode).toBe(200)
    expect(rev2.json().revogado_em).toBe(rev1.json().revogado_em)
    // kernel: sem acesso ativo apos revogar
    expect(await servicoAcessoSuporte.acessoAtivo(poolApi, f.lojaId)).toBeNull()
    await app.close()
  })

  it('acessoAtivo some apos expirar (expira_em no passado)', async () => {
    if (!disponivel) return
    const f = reg(await seedLoja('gerente'))
    const app = await montarApp()
    const h = authLoja(f.userId, f.lojaId)
    const grant = (await app.inject({ method: 'POST', url: '/v1/suporte/acessos', headers: h, payload: { duracao_horas: 24 } })).json()
    expect(await servicoAcessoSuporte.acessoAtivo(poolApi, f.lojaId)).not.toBeNull()
    // forca a expiracao no passado (criado_em tambem recua: check e expira_em > criado_em)
    await poolSuper.query("update public.acessos_suporte set criado_em = now() - interval '2 hours', expira_em = now() - interval '1 hour' where id = $1", [grant.id])
    expect(await servicoAcessoSuporte.acessoAtivo(poolApi, f.lojaId)).toBeNull()
    const lista = await app.inject({ method: 'GET', url: '/v1/suporte/acessos', headers: h })
    expect(lista.json().itens.find((g: { id: string }) => g.id === grant.id).ativo).toBe(false)
    await app.close()
  })

  it('duracao maxima (> 7 dias) e expiracao no passado sao recusadas (422)', async () => {
    if (!disponivel) return
    const f = reg(await seedLoja('gerente'))
    const app = await montarApp()
    const h = authLoja(f.userId, f.lojaId)
    const longe = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()
    const r1 = await app.inject({ method: 'POST', url: '/v1/suporte/acessos', headers: h, payload: { expira_em: longe } })
    expect(r1.statusCode).toBe(422)
    expect(r1.json().error.code).toBe('acesso_duracao_excedida')
    const passado = new Date(Date.now() - 1000).toISOString()
    const r2 = await app.inject({ method: 'POST', url: '/v1/suporte/acessos', headers: h, payload: { expira_em: passado } })
    expect(r2.statusCode).toBe(422)
    expect(r2.json().error.code).toBe('acesso_expira_passado')
    // nem duracao nem expira_em, ou os dois => 400 (refine)
    expect((await app.inject({ method: 'POST', url: '/v1/suporte/acessos', headers: h, payload: {} })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/v1/suporte/acessos', headers: h, payload: { duracao_horas: 1, expira_em: new Date(Date.now() + 3600_000).toISOString() } })).statusCode).toBe(400)
    await app.close()
  })

  it('chamado_id de outra loja no conceder => 404', async () => {
    if (!disponivel) return
    const a = reg(await seedLoja('gerente'))
    const b = reg(await seedLoja('gerente'))
    const app = await montarApp()
    const chamadoB = (await app.inject({ method: 'POST', url: '/v1/suporte/chamados', headers: authLoja(b.userId, b.lojaId), payload: { assunto: 'b', mensagem: 'b' } })).json().id
    const r = await app.inject({ method: 'POST', url: '/v1/suporte/acessos', headers: authLoja(a.userId, a.lojaId), payload: { duracao_horas: 1, chamado_id: chamadoB } })
    await app.close()
    expect(r.statusCode).toBe(404)
  })
})

describe('CONSOLE: operador', () => {
  it('lista a fila, responde (status vira respondido) e ve grants da loja', async () => {
    if (!disponivel) return
    const loja = reg(await seedLoja('gerente'))
    const op = reg(await seedOperador('operador'))
    const app = await montarApp()
    const chamado = (await app.inject({ method: 'POST', url: '/v1/suporte/chamados', headers: authLoja(loja.userId, loja.lojaId), payload: { assunto: 'ajuda', mensagem: 'preciso de ajuda' } })).json()

    const fila = await app.inject({ method: 'GET', url: '/v1/plataforma-suporte/chamados?limite=100', headers: authOp(op.userId) })
    expect(fila.statusCode, fila.body).toBe(200)
    expect(fila.headers['cache-control']).toBe('no-store')
    expect(fila.json().itens.map((c: { id: string }) => c.id)).toContain(chamado.id)
    expect(fila.json()).toHaveProperty('proximoCursor')

    const filtro = await app.inject({ method: 'GET', url: '/v1/plataforma-suporte/chamados?status=aberto&limite=100', headers: authOp(op.userId) })
    expect(filtro.json().itens.map((c: { id: string }) => c.id)).toContain(chamado.id)

    const resp = await app.inject({ method: 'POST', url: `/v1/plataforma-suporte/chamados/${chamado.id}/mensagens`, headers: authOp(op.userId), payload: { texto: 'vamos ver isso' } })
    expect(resp.statusCode, resp.body).toBe(201)
    expect(resp.json().autor_tipo).toBe('operador')
    const ficha = await app.inject({ method: 'GET', url: `/v1/plataforma-suporte/chamados/${chamado.id}`, headers: authOp(op.userId) })
    expect(ficha.json().chamado.status).toBe('respondido')
    expect(ficha.json().mensagens).toHaveLength(2)

    // grants da loja: concede pela loja, operador ve o consentimento
    await app.inject({ method: 'POST', url: '/v1/suporte/acessos', headers: authLoja(loja.userId, loja.lojaId), payload: { duracao_horas: 2 } })
    const grants = await app.inject({ method: 'GET', url: `/v1/plataforma-suporte/lojas/${loja.lojaId}/acessos`, headers: authOp(op.userId) })
    expect(grants.statusCode).toBe(200)
    expect(grants.json().itens.some((g: { ativo: boolean }) => g.ativo)).toBe(true)
    await app.close()
  })

  it('operador convidado (sem suporte_plataforma:*) recebe 403', async () => {
    if (!disponivel) return
    const op = reg(await seedOperador('convidado'))
    const app = await montarApp()
    const r = await app.inject({ method: 'GET', url: '/v1/plataforma-suporte/chamados', headers: authOp(op.userId) })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('membro de loja NAO alcanca rota de console (403) e sem token => 401', async () => {
    if (!disponivel) return
    const loja = reg(await seedLoja('dono'))
    const app = await montarApp()
    expect((await app.inject({ method: 'GET', url: '/v1/plataforma-suporte/chamados' })).statusCode).toBe(401)
    const r = await app.inject({ method: 'GET', url: '/v1/plataforma-suporte/chamados', headers: authOp(loja.userId) })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('SEC-003: console nao expoe rota de conteudo de loja (conversas/pedidos => 404)', async () => {
    if (!disponivel) return
    const loja = reg(await seedLoja('gerente'))
    const op = reg(await seedOperador('operador'))
    const app = await montarApp()
    for (const rota of ['conversas', 'pedidos', 'clientes']) {
      const r = await app.inject({ method: 'GET', url: `/v1/plataforma-suporte/lojas/${loja.lojaId}/${rota}`, headers: authOp(op.userId) })
      expect(r.statusCode, rota).toBe(404)
    }
    // o operador tambem nao escreve grant pelo console (rota inexistente)
    const cria = await app.inject({ method: 'POST', url: `/v1/plataforma-suporte/lojas/${loja.lojaId}/acessos`, headers: authOp(op.userId), payload: { duracao_horas: 1 } })
    expect(cria.statusCode).toBe(404)
    await app.close()
  })
})
