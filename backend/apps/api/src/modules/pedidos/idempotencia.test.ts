// Integracao: idempotencia da criacao de pedido (migration 0079) e lock deterministico da baixa de
// estoque (migration 0075). Cobre: mesma chave em dois submits -> 1 so pedido (sequencial e
// concorrente), sem evento/baixa em dobro; sem chave mantem o comportamento antigo; e a funcao
// pedido_baixar_estoque foi recriada com ORDER BY (ordem de lock deterministica).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { poolSuper } from '../../../test/db'
import { chamar, corpoPadrao, encerrar, montarMundo, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[pedidos/idempotencia] banco inacessivel: integracao PULADA.')

d('idempotencia da criacao de pedido (0079) e lock deterministico (0075)', () => {
  let m: Mundo
  beforeAll(async () => { m = await montarMundo() })
  afterAll(async () => { if (m) await encerrar(m) })

  const contar = async (chave: string): Promise<number> =>
    Number((await poolSuper.query<{ n: string }>(
      'select count(*)::text as n from public.pedidos where loja_id = $1 and chave_idempotencia = $2',
      [m.A.loja, chave],
    )).rows[0]!.n)

  const eventos = async (pedidoId: string): Promise<number> =>
    Number((await poolSuper.query<{ n: string }>(
      "select count(*)::text as n from public.eventos where tipo = 'pedido.criado' and entidade_id = $1",
      [pedidoId],
    )).rows[0]!.n)

  it('dois submits com a MESMA chave criam 1 so pedido (sequencial) e devolvem o mesmo id', async () => {
    const chave = randomUUID()
    const body = corpoPadrao(m.A, { chave_idempotencia: chave })
    const r1 = await chamar(m, m.dono, m.A.loja, 'POST', '/', body)
    const r2 = await chamar(m, m.dono, m.A.loja, 'POST', '/', body)
    expect(r1.status, JSON.stringify(r1.corpo)).toBe(201)
    expect(r2.status, JSON.stringify(r2.corpo)).toBe(201)
    expect(r2.corpo.id).toBe(r1.corpo.id)
    expect(r2.corpo.codigo).toBe(r1.corpo.codigo)
    // Uma unica linha de pedido e um unico evento de criacao (nada reprocessado).
    expect(await contar(chave)).toBe(1)
    expect(await eventos(r1.corpo.id)).toBe(1)
  })

  it('submits CONCORRENTES com a mesma chave convergem para 1 pedido (on conflict)', async () => {
    const chave = randomUUID()
    const body = corpoPadrao(m.A, { chave_idempotencia: chave })
    const [a, b, c] = await Promise.all([
      chamar(m, m.dono, m.A.loja, 'POST', '/', body),
      chamar(m, m.dono, m.A.loja, 'POST', '/', body),
      chamar(m, m.dono, m.A.loja, 'POST', '/', body),
    ])
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201])
    expect(new Set([a.corpo.id, b.corpo.id, c.corpo.id]).size).toBe(1)
    expect(await contar(chave)).toBe(1)
  })

  it('chaves diferentes criam pedidos distintos; sem chave mantem o comportamento antigo', async () => {
    const r1 = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { chave_idempotencia: randomUUID() }))
    const r2 = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { chave_idempotencia: randomUUID() }))
    expect(r1.corpo.id).not.toBe(r2.corpo.id)
    // Sem chave: dois pedidos distintos (null nao entra no indice parcial).
    const s1 = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A))
    const s2 = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A))
    expect(s1.status).toBe(201)
    expect(s2.status).toBe(201)
    expect(s1.corpo.id).not.toBe(s2.corpo.id)
  })

  it('chave UUID invalida e rejeitada pelo Zod (400)', async () => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { chave_idempotencia: 'nao-e-uuid' }))
    expect(r.status).toBe(400)
    expect(r.corpo.error.code).toBe('entrada_invalida')
  })

  it('repetir e idempotente com a mesma chave (1 so pedido novo)', async () => {
    const original = (await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A))).corpo
    const chave = randomUUID()
    const r1 = await chamar(m, m.dono, m.A.loja, 'POST', `/${original.id}/repetir`, { chave_idempotencia: chave })
    const r2 = await chamar(m, m.dono, m.A.loja, 'POST', `/${original.id}/repetir`, { chave_idempotencia: chave })
    expect(r1.status, JSON.stringify(r1.corpo)).toBe(201)
    expect(r2.status).toBe(201)
    expect(r2.corpo.id).toBe(r1.corpo.id)
    expect(await contar(chave)).toBe(1)
  })

  it('0075: pedido_baixar_estoque foi recriada com ORDER BY (lock deterministico)', async () => {
    const def = (await poolSuper.query<{ src: string }>(
      "select pg_get_functiondef('public.pedido_baixar_estoque()'::regprocedure) as src",
    )).rows[0]!.src.toLowerCase()
    // Ordem deterministica em ambos os loops (item e insumo): evita deadlock 40P01.
    expect(def).toContain('order by ip.item_id')
    expect(def).toContain('order by ft.insumo_id')
  })
})
