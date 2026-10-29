// Oversell do item do cardapio (historia 03, regra 3): a recusa preventiva na efetivacao do pedido.
// Cobre a corrida (dois pedidos do ultimo item: um efetiva, o outro recebe estoque_insuficiente) e
// o caso sequencial (sem saldo => 409; com saldo exato => 201 e item zera, saindo da oferta).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[pedidos/oversell] banco inacessivel: integracao PULADA.')

async function uma<T = { id: string }>(sql: string, params: unknown[]): Promise<T> {
  const r = await poolSuper.query(sql, params)
  return r.rows[0] as T
}

const qtdItem = async (id: string): Promise<number | null> =>
  (await uma<{ q: number | null }>('select quantidade_disponivel as q from public.itens where id = $1', [id])).q

d('oversell do item na efetivacao (historia 03)', () => {
  let m: Mundo
  let categoria = ''
  const lojas: string[] = []

  beforeAll(async () => {
    m = await montarMundo()
    categoria = (await uma('insert into public.categorias (loja_id, nome) values ($1,$2) returning id', [m.A.loja, 'Oversell'])).id
    lojas.push(m.A.loja, m.B.loja)
  })
  afterAll(async () => {
    if (!m) return
    await poolSuper.query('delete from public.movimentos_item_estoque where loja_id = any($1)', [lojas])
    await encerrar(m)
  })

  const itemComSaldo = async (qtd: number): Promise<string> =>
    (await uma(
      `insert into public.itens (loja_id, categoria_id, nome, preco_centavos, controla_estoque, quantidade_disponivel)
       values ($1,$2,$3,500,true,$4) returning id`,
      [m.A.loja, categoria, `Item ${Math.random().toString(36).slice(2, 8)}`, qtd],
    )).id

  const pedir = (itemId: string, quantidade: number) =>
    chamar(m, m.dono, m.A.loja, 'POST', '/', {
      cliente_id: m.A.cliente, modalidade: 'retirada', taxa_entrega_centavos: 0,
      itens: [{ item_id: itemId, quantidade }],
    })

  it('dois pedidos do ultimo item: um efetiva, o outro e recusado (sem oversell)', async () => {
    const item = await itemComSaldo(1)
    const [r1, r2] = await Promise.all([pedir(item, 1), pedir(item, 1)])
    const ctx = `${r1.status}/${JSON.stringify(r1.corpo)} ${r2.status}/${JSON.stringify(r2.corpo)}`
    const efetivados = [r1, r2].filter((r) => r.status === 201)
    const recusados = [r1, r2].filter((r) => r.status !== 201)
    // Invariante: exatamente um efetiva; o outro e recusado sem vender a unidade duas vezes.
    expect(efetivados.length, ctx).toBe(1)
    expect(recusados.length, ctx).toBe(1)
    // Recusa valida: estoque_insuficiente (A1, sob lock) OU item_indisponivel (item ja esgotou ao
    // zerar, historia 03). As duas barram o oversell; a corrida decide qual guarda pega.
    expect(['estoque_insuficiente', 'item_indisponivel'], ctx).toContain(recusados[0]!.corpo.error.code)
    expect(await qtdItem(item)).toBe(0) // exatamente uma venda baixou o saldo
  })

  it('sem saldo suficiente recusa (409); vender o saldo exato efetiva e zera o item', async () => {
    const item = await itemComSaldo(2)
    const demais = await pedir(item, 3)
    expect(demais.status).toBe(409)
    expect(demais.corpo.error.code).toBe('estoque_insuficiente')
    expect(await qtdItem(item)).toBe(2) // intacto

    const certo = await pedir(item, 2)
    expect(certo.status, JSON.stringify(certo.corpo)).toBe(201)
    expect(await qtdItem(item)).toBe(0)
  })

  it('item sem controle de estoque nunca barra por contagem', async () => {
    const livre = (await uma(
      'insert into public.itens (loja_id, categoria_id, nome, preco_centavos) values ($1,$2,$3,500) returning id',
      [m.A.loja, categoria, 'Sem controle'],
    )).id
    const r = await pedir(livre, 99)
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
  })
})
