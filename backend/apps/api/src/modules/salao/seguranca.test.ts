// Seguranca do modulo salao (SEC-001/002/003/030/080) contra o Postgres local.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolApi } from '../../../test/db'
import { chamar, encerrar, montarMundo, novoId, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip

d('modulo salao (seguranca)', () => {
  let m: Mundo
  beforeAll(async () => { m = await montarMundo() })
  afterAll(async () => { if (m) await encerrar(m) })

  const abrirComanda = async (loja = m.A.loja, user = m.dono) => {
    const mesa = await chamar(m, user, loja, 'POST', '/mesas', { nome: `Mesa ${novoId().slice(0, 8)}` })
    expect(mesa.status, JSON.stringify(mesa.corpo)).toBe(201)
    const c = await chamar(m, user, loja, 'POST', '/comandas', { mesa_id: mesa.corpo.id })
    expect(c.status, JSON.stringify(c.corpo)).toBe(201)
    return { mesaId: mesa.corpo.id as string, comandaId: c.corpo.id as string }
  }

  it('SEC-001: loja B nao le, lanca nem fecha comanda da loja A (404); mesa de A invisivel em B', async () => {
    const { mesaId, comandaId } = await abrirComanda()
    const B = (metodo: 'GET' | 'POST' | 'PATCH', url: string, corpo?: unknown) =>
      chamar(m, m.donoB, m.B.loja, metodo, url, corpo)
    expect((await B('GET', `/comandas/${comandaId}`)).status).toBe(404)
    expect((await B('POST', `/comandas/${comandaId}/itens`, { item_id: m.B.cardapio.burger, quantidade: 1 })).status).toBe(404)
    expect((await B('POST', `/comandas/${comandaId}/fechar`, { forma_pagamento: 'dinheiro' })).status).toBe(404)
    expect((await B('PATCH', `/mesas/${mesaId}`, { nome: 'Invasor' })).status).toBe(404)
    const mesasB = await B('GET', '/mesas')
    expect(mesasB.corpo.itens.map((x: { id: string }) => x.id)).not.toContain(mesaId)
    // comanda de A segue intacta e aberta
    expect((await chamar(m, m.dono, m.A.loja, 'GET', `/comandas/${comandaId}`)).corpo.status).toBe('aberta')
  })

  it('SEC-002: item de outra loja nao entra na comanda (404); loja_id no corpo e rejeitado (400)', async () => {
    const { comandaId } = await abrirComanda()
    const itemB = await chamar(m, m.dono, m.A.loja, 'POST', `/comandas/${comandaId}/itens`, { item_id: m.B.cardapio.burger, quantidade: 1 })
    expect(itemB.status).toBe(404)
    const forjado = await chamar(m, m.dono, m.A.loja, 'POST', '/mesas', { nome: 'X', loja_id: m.B.loja })
    expect(forjado.status).toBe(400)
    expect(forjado.corpo.error.code).toBe('entrada_invalida')
  })

  it('usuario da loja A nao opera passando x-loja-id da loja B (404 do escopo)', async () => {
    expect((await chamar(m, m.dono, m.B.loja, 'GET', '/mesas')).status).toBe(404)
  })

  it('uma comanda aberta por mesa: abrir a segunda e barrado (409 mesa_ocupada)', async () => {
    const { mesaId } = await abrirComanda()
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/comandas', { mesa_id: mesaId })
    expect(r.status).toBe(409)
    expect(r.corpo.error.code).toBe('mesa_ocupada')
  })

  it('permissao: atendente opera comandas mas nao cadastra mesa (403 loja:gerir)', async () => {
    // atendente abre comanda numa mesa criada pelo dono
    const mesa = (await chamar(m, m.dono, m.A.loja, 'POST', '/mesas', { nome: `Mesa ${novoId().slice(0, 8)}` })).corpo
    const abre = await chamar(m, m.atendente, m.A.loja, 'POST', '/comandas', { mesa_id: mesa.id })
    expect(abre.status, JSON.stringify(abre.corpo)).toBe(201)
    // mas nao pode cadastrar/editar mesa
    expect((await chamar(m, m.atendente, m.A.loja, 'POST', '/mesas', { nome: 'Nope' })).status).toBe(403)
    expect((await chamar(m, m.atendente, m.A.loja, 'PATCH', `/mesas/${mesa.id}`, { nome: 'Nope' })).status).toBe(403)
    // gerente cadastra mesa
    expect((await chamar(m, m.gerente, m.A.loja, 'POST', '/mesas', { nome: `Mesa ${novoId().slice(0, 8)}` })).status).toBe(201)
  })

  it('SEC-003: operador da plataforma e negado em todos os endpoints', async () => {
    const { mesaId, comandaId } = await abrirComanda()
    const chamadas: [Parameters<typeof chamar>[3], string, unknown?][] = [
      ['GET', '/mesas'], ['POST', '/mesas', { nome: 'Z' }], ['PATCH', `/mesas/${mesaId}`, { nome: 'Z' }],
      ['POST', '/comandas', { mesa_id: mesaId }], ['GET', `/comandas/${comandaId}`],
      ['POST', `/comandas/${comandaId}/itens`, { item_id: m.A.cardapio.burger, quantidade: 1 }],
      ['POST', `/comandas/${comandaId}/fechar`, { forma_pagamento: 'dinheiro' }],
    ]
    for (const [met, url, corpo] of chamadas) {
      const r = await chamar(m, m.operador, m.A.loja, met, url, corpo)
      expect([403, 404], `${met} ${url}`).toContain(r.status)
    }
  })

  it('sem autenticacao: 401; id malformado: 400', async () => {
    const res = await m.app.inject({ method: 'GET', url: '/v1/salao/mesas' })
    expect(res.statusCode).toBe(401)
    expect((await chamar(m, m.dono, m.A.loja, 'GET', '/comandas/nao-e-uuid')).status).toBe(400)
  })

  it('SEC-030: whaviso_api nao tem DELETE em mesas, comandas e comanda_itens (RLS/privilegio)', async () => {
    const negado = /permission denied|permiss/
    await expect(poolApi.query('delete from public.mesas where false')).rejects.toThrow(negado)
    await expect(poolApi.query('delete from public.comandas where false')).rejects.toThrow(negado)
    await expect(poolApi.query('delete from public.comanda_itens where false')).rejects.toThrow(negado)
  })

  it('SEC-080: texto de SQL em observacoes e tratado como dado', async () => {
    const mesa = (await chamar(m, m.dono, m.A.loja, 'POST', '/mesas', { nome: `Mesa ${novoId().slice(0, 8)}` })).corpo
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/comandas', {
      mesa_id: mesa.id, observacoes: "x'; drop table public.comandas; --",
    })
    expect(r.status).toBe(201)
    expect(r.corpo.observacoes).toContain('drop table')
    expect((await chamar(m, m.dono, m.A.loja, 'GET', '/mesas')).status).toBe(200)
  })
})
