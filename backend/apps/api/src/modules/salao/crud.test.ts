// Integracao do fluxo feliz do salao: mesa -> comanda -> lancar item -> total -> fechar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chamar, encerrar, montarMundo, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[salao] banco inacessivel: integracao PULADA.')

d('modulo salao (crud)', () => {
  let m: Mundo
  beforeAll(async () => { m = await montarMundo() })
  afterAll(async () => { if (m) await encerrar(m) })

  const comoDono = (metodo: 'GET' | 'POST' | 'PATCH', url: string, corpo?: unknown) =>
    chamar(m, m.dono, m.A.loja, metodo, url, corpo)

  let mesaId = ''
  let comandaId = ''

  it('cria mesa e a lista traz comanda_aberta_id nulo', async () => {
    const r = await comoDono('POST', '/mesas', { nome: 'Mesa 1', capacidade: 4 })
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    mesaId = r.corpo.id
    expect(r.corpo).toMatchObject({ nome: 'Mesa 1', capacidade: 4, ativo: true, comanda_aberta_id: null })
    const lista = await comoDono('GET', '/mesas')
    expect(lista.status).toBe(200)
    expect(lista.corpo.itens.find((x: { id: string }) => x.id === mesaId).comanda_aberta_id).toBeNull()
  })

  it('nome de mesa duplicado entre ativas: 409 mesa_nome_em_uso', async () => {
    const r = await comoDono('POST', '/mesas', { nome: 'Mesa 1' })
    expect(r.status).toBe(409)
    expect(r.corpo.error.code).toBe('mesa_nome_em_uso')
  })

  it('abre comanda numa mesa livre; mesa passa a mostrar a comanda aberta', async () => {
    const r = await comoDono('POST', '/comandas', { mesa_id: mesaId })
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    comandaId = r.corpo.id
    expect(r.corpo).toMatchObject({ mesa_id: mesaId, mesa_nome: 'Mesa 1', status: 'aberta', total_centavos: 0, itens: [] })
    const lista = await comoDono('GET', '/mesas')
    const mesa = lista.corpo.itens.find((x: { id: string }) => x.id === mesaId)
    expect(mesa.comanda_aberta_id).toBe(comandaId)
  })

  it('abrir segunda comanda na mesma mesa: 409 mesa_ocupada (uma aberta por mesa)', async () => {
    const r = await comoDono('POST', '/comandas', { mesa_id: mesaId })
    expect(r.status).toBe(409)
    expect(r.corpo.error.code).toBe('mesa_ocupada')
  })

  it('lanca itens: snapshot de nome/preco vem do cardapio e total recalcula', async () => {
    const r1 = await comoDono('POST', `/comandas/${comandaId}/itens`, { item_id: m.A.cardapio.burger, quantidade: 2 })
    expect(r1.status, JSON.stringify(r1.corpo)).toBe(200)
    expect(r1.corpo.total_centavos).toBe(4000)
    expect(r1.corpo.itens[0]).toMatchObject({
      nome_item: 'Burger', preco_unitario_centavos: 2000, quantidade: 2, total_centavos: 4000,
    })
    const r2 = await comoDono('POST', `/comandas/${comandaId}/itens`, { item_id: m.A.cardapio.suco, quantidade: 1 })
    expect(r2.status).toBe(200)
    expect(r2.corpo.total_centavos).toBe(4800)
    expect(r2.corpo.itens).toHaveLength(2)
  })

  it('cliente nao envia preco: campo extra no corpo e rejeitado (400)', async () => {
    const r = await comoDono('POST', `/comandas/${comandaId}/itens`, {
      item_id: m.A.cardapio.suco, quantidade: 1, preco_unitario_centavos: 1,
    })
    expect(r.status).toBe(400)
    expect(r.corpo.error.code).toBe('entrada_invalida')
  })

  it('lancar item inativo: 422 item_inativo; item inexistente: 404', async () => {
    const inativo = await comoDono('POST', `/comandas/${comandaId}/itens`, { item_id: m.A.cardapio.inativo, quantidade: 1 })
    expect(inativo.status).toBe(422)
    expect(inativo.corpo.error.code).toBe('item_inativo')
    const sumido = await comoDono('POST', `/comandas/${comandaId}/itens`, { item_id: m.B.cardapio.burger, quantidade: 1 })
    expect(sumido.status).toBe(404)
  })

  it('detalhe da comanda reflete os lancamentos', async () => {
    const r = await comoDono('GET', `/comandas/${comandaId}`)
    expect(r.status).toBe(200)
    expect(r.corpo.total_centavos).toBe(4800)
    expect(r.corpo.itens.map((i: { nome_item: string }) => i.nome_item).sort()).toEqual(['Burger', 'Suco'])
  })

  it('fecha a comanda; mesa volta a ficar livre; lancar/fechar de novo: 409 comanda_fechada', async () => {
    const r = await comoDono('POST', `/comandas/${comandaId}/fechar`, { forma_pagamento: 'dinheiro' })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(r.corpo.status).toBe('fechada')
    expect(r.corpo.fechada_em).toMatch(/Z$/)
    expect(r.corpo.total_centavos).toBe(4800)
    const lista = await comoDono('GET', '/mesas')
    expect(lista.corpo.itens.find((x: { id: string }) => x.id === mesaId).comanda_aberta_id).toBeNull()
    const relanca = await comoDono('POST', `/comandas/${comandaId}/itens`, { item_id: m.A.cardapio.burger, quantidade: 1 })
    expect(relanca.status).toBe(409)
    expect(relanca.corpo.error.code).toBe('comanda_fechada')
    expect((await comoDono('POST', `/comandas/${comandaId}/fechar`, { forma_pagamento: 'dinheiro' })).status).toBe(409)
  })

  it('apos fechar, a mesa pode receber nova comanda', async () => {
    const r = await comoDono('POST', '/comandas', { mesa_id: mesaId })
    expect(r.status).toBe(201)
    expect(r.corpo.id).not.toBe(comandaId)
  })

  it('PATCH de mesa: renomear, trocar capacidade (null limpa) e desativar', async () => {
    const nova = (await comoDono('POST', '/mesas', { nome: 'Mesa 9', capacidade: 2 })).corpo
    const p = await comoDono('PATCH', `/mesas/${nova.id}`, { nome: 'Varanda', capacidade: null })
    expect(p.status).toBe(200)
    expect(p.corpo).toMatchObject({ nome: 'Varanda', capacidade: null })
    const des = await comoDono('PATCH', `/mesas/${nova.id}`, { ativo: false })
    expect(des.corpo.ativo).toBe(false)
    // nome liberado para reuso entre ativas apos desativar
    expect((await comoDono('POST', '/mesas', { nome: 'Varanda' })).status).toBe(201)
    expect((await comoDono('PATCH', `/mesas/${nova.id}`, {})).status).toBe(400)
  })
})
