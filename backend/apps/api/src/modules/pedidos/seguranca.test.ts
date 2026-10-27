// Seguranca do modulo pedidos (SEC-001/002/003/024/030/080) contra o Postgres local.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolApi } from '../../../test/db'
import {
  LOGRADOURO, NOME_CLIENTE, TELEFONE, chamar, corpoPadrao, encerrar, logs, montarMundo, novoId, online, type Mundo,
} from './tests/harness'

const d = online ? describe : describe.skip

d('modulo pedidos (seguranca)', () => {
  let m: Mundo
  beforeAll(async () => { m = await montarMundo() })
  afterAll(async () => { if (m) await encerrar(m) })

  const criar = async (extra: Record<string, unknown> = {}) => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, extra))
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    return r.corpo as { id: string; codigo: string; itens: { id: string }[] }
  }

  it('SEC-001: loja B nao le, move, cancela nem imprime pedido da loja A (404)', async () => {
    const p = await criar()
    const item = p.itens[0]!.id
    const B = (metodo: 'GET' | 'POST', url: string, corpo?: unknown) => chamar(m, m.donoB, m.B.loja, metodo, url, corpo)
    expect((await B('GET', `/${p.id}`)).status).toBe(404)
    expect((await B('POST', `/${p.id}/status`, { para: 'em_preparo' })).status).toBe(404)
    expect((await B('POST', `/${p.id}/itens/${item}/cancelar`)).status).toBe(404)
    expect((await B('GET', `/${p.id}/impressao`)).status).toBe(404)
    const k = await B('GET', '/?limite=100')
    const ids = Object.values(k.corpo.colunas as Record<string, { itens: { id: string }[] }>).flatMap((c) => c.itens.map((i) => i.id))
    expect(ids).not.toContain(p.id)
    // e o pedido segue intacto
    expect((await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}`)).corpo.status).toBe('novo')
  })

  it('usuario da loja A nao opera passando x-loja-id da loja B (404 do escopo)', async () => {
    const r = await chamar(m, m.dono, m.B.loja, 'GET', '/')
    expect(r.status).toBe(404)
  })

  it('SEC-002: loja_id do corpo e ignorado/rejeitado; item, opcao, cliente e endereco de outra loja nao entram', async () => {
    const forjado = await chamar(m, m.dono, m.A.loja, 'POST', '/', { ...corpoPadrao(m.A), loja_id: m.B.loja })
    expect(forjado.status).toBe(400)
    const itemB = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, {
      itens: [{ item_id: m.B.cardapio.burger, quantidade: 1, opcoes_ids: [m.B.cardapio.pequena] }] }))
    expect(itemB.status).toBe(422)
    expect(itemB.corpo.error.code).toBe('item_invalido')
    const opcaoB = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, {
      itens: [{ item_id: m.A.cardapio.burger, quantidade: 1, opcoes_ids: [m.B.cardapio.pequena] }] }))
    expect(opcaoB.status).toBe(422)
    expect(opcaoB.corpo.error.code).toBe('opcao_invalida')
    const clienteB = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { cliente_id: m.B.cliente }))
    expect(clienteB.status).toBe(404)
    const endB = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { endereco_id: m.B.endereco }))
    expect(endB.status).toBe(404)
    const endOutroCliente = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { endereco_id: novoId() }))
    expect(endOutroCliente.status).toBe(404)
  })

  it('SEC-003: operador da plataforma e negado em todos os endpoints', async () => {
    const p = await criar()
    const id = p.id
    const item = p.itens[0]!.id
    const chamadas: [Parameters<typeof chamar>[3], string, unknown?][] = [
      ['GET', '/'], ['POST', '/', corpoPadrao(m.A)], ['GET', `/${id}`], ['POST', `/${id}/status`, { para: 'em_preparo' }],
      ['POST', `/${id}/itens/${item}/cancelar`], ['GET', `/${id}/impressao`],
    ]
    for (const [met, url, corpo] of chamadas) {
      const r = await chamar(m, m.operador, m.A.loja, met, url, corpo)
      expect([403, 404], `${met} ${url}`).toContain(r.status)
    }
    expect((await chamar(m, m.A.loja, m.A.loja, 'GET', '/')).status).toBeGreaterThanOrEqual(401)
  })

  it('sem autenticacao: 401', async () => {
    const res = await m.app.inject({ method: 'GET', url: '/v1/pedidos' })
    expect(res.statusCode).toBe(401)
  })

  it('SEC-030: whaviso_api nao tem DELETE em pedidos, itens_pedido e itens_pedido_opcoes', async () => {
    const negado = /permission denied|permiss/
    await expect(poolApi.query('delete from public.pedidos where false')).rejects.toThrow(negado)
    await expect(poolApi.query('delete from public.itens_pedido where false')).rejects.toThrow(negado)
    await expect(poolApi.query('delete from public.itens_pedido_opcoes where false')).rejects.toThrow(negado)
  })

  it('SEC-024: nome, endereco e telefone nao aparecem nos logs', async () => {
    const p = await criar()
    await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}`)
    await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}/impressao`)
    await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { itens: [] }))
    const todos = logs.join('')
    expect(todos.length).toBeGreaterThan(0)
    for (const proibido of [NOME_CLIENTE, LOGRADOURO, TELEFONE, '99999-1234']) expect(todos).not.toContain(proibido)
  })

  it('SEC-080: texto de SQL em observacao e tratado como dado', async () => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { observacao: "x'; drop table public.pedidos; --" }))
    expect(r.status).toBe(201)
    expect(r.corpo.observacao).toContain('drop table')
    expect((await chamar(m, m.dono, m.A.loja, 'GET', '/')).status).toBe(200)
  })
})
