// Integracao: convites (criar, listar, revogar, aceitar) e SEC-002/024/101.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import { bancoAcessivel, fecharPools, limpar } from '../../../test/db'
import {
  criarAppConta,
  type App,
  criarChamador,
  criarMembro,
  criarUsuario,
  montar,
  novoCenario,
  poolSuper,
  tokenDoLink,
} from './harness'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

d('convites (integracao)', () => {
  let app: App
  let chamar: ReturnType<typeof criarChamador>
  const c = novoCenario()

  beforeAll(async () => {
    app = await criarAppConta()
    chamar = criarChamador(app)
  })
  afterAll(async () => {
    await app?.close()
    await limpar(c)
    await fecharPools()
  })

  it('dono convida, token so em hash, convidado aceita e aparece em /membros', async () => {
    const t = await montar(c)
    const r = await chamar(t.dono, 'POST', '/convites', { papel: 'atendente', loja_id: t.lojaA })
    expect(r.statusCode).toBe(201)
    const conv = r.json()
    const token = tokenDoLink(conv.link)
    expect(token).toHaveLength(43)
    const row = await poolSuper.query('select c::text as t from public.convites c where id = $1', [conv.id])
    expect(row.rows[0].t).not.toContain(token)
    expect(row.rows[0].t).toContain(createHash('sha256').update(token).digest('hex'))
    const ev = await poolSuper.query('select detalhes::text as t from public.eventos where entidade_id = $1', [conv.id])
    expect(JSON.stringify(ev.rows)).not.toContain(token)
    const lista = (await chamar(t.dono, 'GET', '/convites')).json().convites
    expect(lista).toHaveLength(1)
    expect(lista[0].link).toBeUndefined()

    const convidado = await criarUsuario(c)
    const ac = await chamar(convidado, 'POST', '/convites/aceitar', { token })
    expect(ac.statusCode).toBe(200)
    expect(ac.json()).toMatchObject({ conta_id: t.contaId, loja_id: t.lojaA, papel: 'atendente' })
    const membros = (await chamar(t.dono, 'GET', '/membros')).json().membros
    expect(membros.find((m: { user_id: string }) => m.user_id === convidado)).toMatchObject({
      papel: 'atendente',
      loja_id: t.lojaA,
      ativo: true,
    })
    expect((await chamar(t.dono, 'GET', '/convites')).json().convites).toEqual([])
  })

  it('token errado 404, reuso 409, revogado e expirado 410', async () => {
    const t = await montar(c)
    const u = await criarUsuario(c)
    expect((await chamar(u, 'POST', '/convites/aceitar', { token: 'a'.repeat(43) })).statusCode).toBe(404)

    const novo = async () => (await chamar(t.dono, 'POST', '/convites', { papel: 'gerente' })).json()
    const c1 = await novo()
    const t1 = tokenDoLink(c1.link)
    expect((await chamar(u, 'POST', '/convites/aceitar', { token: t1 })).statusCode).toBe(200)
    const reuso = await chamar(await criarUsuario(c), 'POST', '/convites/aceitar', { token: t1 })
    expect(reuso.statusCode).toBe(409)
    expect(reuso.json().error.code).toBe('convite_ja_aceito')

    const c2 = await novo()
    expect((await chamar(t.dono, 'POST', `/convites/${c2.id}/revogar`)).statusCode).toBe(204)
    expect((await chamar(t.dono, 'POST', `/convites/${c2.id}/revogar`)).statusCode).toBe(409)
    const rev = await chamar(await criarUsuario(c), 'POST', '/convites/aceitar', { token: tokenDoLink(c2.link) })
    expect(rev.statusCode).toBe(410)
    expect(rev.json().error.code).toBe('convite_revogado')

    const c3 = await novo()
    await poolSuper.query("update public.convites set expira_em = now() - interval '1 second' where id = $1", [c3.id])
    const exp = await chamar(await criarUsuario(c), 'POST', '/convites/aceitar', { token: tokenDoLink(c3.link) })
    expect(exp.statusCode).toBe(410)
    expect(exp.json().error.code).toBe('convite_expirado')
  })

  it('usuario ja membro leva 409 sem consumir o token; membro de outra conta tambem', async () => {
    const t = await montar(c)
    const x = await montar(c)
    const conv = (await chamar(t.dono, 'POST', '/convites', { papel: 'atendente' })).json()
    const token = tokenDoLink(conv.link)
    const ja = await chamar(t.dono, 'POST', '/convites/aceitar', { token })
    expect(ja.statusCode).toBe(409)
    expect(ja.json().error.code).toBe('ja_membro')
    const outra = await chamar(x.dono, 'POST', '/convites/aceitar', { token })
    expect(outra.json().error.code).toBe('membro_de_outra_conta')
    const { rows } = await poolSuper.query('select aceito_em from public.convites where id = $1', [conv.id])
    expect(rows[0].aceito_em).toBeNull()
  })

  it('duplo aceite concorrente: so um ganha', async () => {
    const t = await montar(c)
    const conv = (await chamar(t.dono, 'POST', '/convites', { papel: 'atendente' })).json()
    const token = tokenDoLink(conv.link)
    const us = [await criarUsuario(c), await criarUsuario(c), await criarUsuario(c)]
    const rs = await Promise.all(us.map((u) => chamar(u, 'POST', '/convites/aceitar', { token })))
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 409, 409])
    const { rows } = await poolSuper.query('select count(*)::int as n from public.membros where conta_id = $1', [t.contaId])
    expect(rows[0].n).toBe(2)
  })

  it('reativa membro inativo ao aceitar novo convite do mesmo alcance', async () => {
    const t = await montar(c)
    const u = await criarUsuario(c)
    await poolSuper.query(
      "insert into public.membros (conta_id, loja_id, user_id, papel, ativo) values ($1, null, $2, 'atendente', false)",
      [t.contaId, u],
    )
    const conv = (await chamar(t.dono, 'POST', '/convites', { papel: 'gerente' })).json()
    const ac = await chamar(u, 'POST', '/convites/aceitar', { token: tokenDoLink(conv.link) })
    expect(ac.statusCode).toBe(200)
    expect(ac.json().papel).toBe('gerente')
  })

  it('quem convida: gerente so atendente/gerente nas suas lojas; SEC-002 loja de outra conta', async () => {
    const t = await montar(c)
    const o = await montar(c)
    const ger = await criarUsuario(c)
    await criarMembro(t.contaId, ger, 'gerente', t.lojaA)
    expect((await chamar(ger, 'POST', '/convites', { papel: 'dono' })).statusCode).toBe(403)
    expect((await chamar(ger, 'POST', '/convites', { papel: 'atendente', loja_id: t.lojaB })).statusCode).toBe(403)
    expect((await chamar(ger, 'POST', '/convites', { papel: 'atendente' })).statusCode).toBe(403)
    expect((await chamar(ger, 'POST', '/convites', { papel: 'gerente', loja_id: t.lojaA })).statusCode).toBe(201)
    expect((await chamar(t.dono, 'POST', '/convites', { papel: 'atendente', loja_id: o.lojaA })).statusCode).toBe(404)
    expect((await chamar(t.dono, 'POST', '/convites', { papel: 'dono', loja_id: t.lojaA })).statusCode).toBe(422)
    expect((await chamar(t.dono, 'POST', '/convites', { papel: 'atendente', conta_id: o.contaId })).statusCode).toBe(400)
  })

  it('revogar convite de outra conta e 404', async () => {
    const a = await montar(c)
    const b = await montar(c)
    const conv = (await chamar(b.dono, 'POST', '/convites', { papel: 'atendente' })).json()
    expect((await chamar(a.dono, 'POST', `/convites/${conv.id}/revogar`)).statusCode).toBe(404)
  })

  it('aceite tem rate limit proprio (SEC-101)', async () => {
    const u = await criarUsuario(c)
    const codigos: number[] = []
    for (let i = 0; i < 12; i++) {
      codigos.push((await chamar(u, 'POST', '/convites/aceitar', { token: 'b'.repeat(43) }, '10.9.9.8')).statusCode)
    }
    expect(codigos.at(-1)).toBe(429)
  })
})
