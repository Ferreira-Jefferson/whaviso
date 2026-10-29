// Integracao do trigger de baixa de estoque na EFETIVACAO do pedido (migration 0055).
// Cobre: contador por item decrementado; insumos da ficha tecnica explodidos; item sem ficha so
// mexe no contador; estoque ilimitado (quantidade NULL) nao decrementa; estoque insuficiente
// trava em zero (nunca negativo); idempotencia (efetivar uma vez baixa uma vez, inclusive sob
// UPDATE que mantem 'novo'); e a aresta rascunho -> novo (caminho do atendente) tambem baixa.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[pedidos/baixa] banco inacessivel: integracao PULADA.')

async function uma<T = { id: string }>(sql: string, params: unknown[]): Promise<T> {
  const r = await poolSuper.query(sql, params)
  return r.rows[0] as T
}

interface Semeado {
  categoria: string
  contado: string // controla estoque, sem ficha
  ficha: string // controla estoque + ficha tecnica (pao, carne)
  ilimitado: string // controla estoque com quantidade NULL
  insuf: string // controla estoque com 1 unidade
  pao: string
  carne: string
}

async function semearEstoque(loja: string): Promise<Semeado> {
  const categoria = (await uma('insert into public.categorias (loja_id, nome) values ($1,$2) returning id', [loja, 'EstoqueTeste'])).id
  const item = async (nome: string, preco: number, controla: boolean, qtd: number | null) =>
    (await uma(
      `insert into public.itens (loja_id, categoria_id, nome, preco_centavos, controla_estoque, quantidade_disponivel)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [loja, categoria, nome, preco, controla, qtd],
    )).id
  const contado = await item('Agua', 500, true, 10)
  const ficha = await item('Prato Feito', 2000, true, 20)
  const ilimitado = await item('Cafe', 300, true, null)
  const insuf = await item('Sobremesa', 700, true, 1)
  const insumo = async (nome: string, qtd: number) =>
    (await uma(
      `insert into public.insumos (loja_id, nome, unidade, quantidade_atual, quantidade_minima)
       values ($1,$2,'un',$3,0) returning id`,
      [loja, nome, qtd],
    )).id
  const pao = await insumo('Pao', 100)
  const carne = await insumo('Carne', 50)
  await poolSuper.query(
    'insert into public.fichas_tecnicas (loja_id, item_id, insumo_id, quantidade, ativo) values ($1,$2,$3,$4,true),($1,$2,$5,$6,true)',
    [loja, ficha, pao, 2, carne, 1],
  )
  return { categoria, contado, ficha, ilimitado, insuf, pao, carne }
}

const qtdItem = async (id: string): Promise<number | null> =>
  (await uma<{ q: number | null }>('select quantidade_disponivel as q from public.itens where id = $1', [id])).q
const qtdInsumo = async (id: string): Promise<number> =>
  Number((await uma<{ q: string }>('select quantidade_atual::text as q from public.insumos where id = $1', [id])).q)
const movsVenda = async (pedido: string, item: string): Promise<number> =>
  Number((await uma<{ n: string }>(
    `select count(*)::text as n from public.movimentos_item_estoque where pedido_id = $1 and item_id = $2 and tipo = 'venda'`,
    [pedido, item],
  )).n)
const movsConsumo = async (pedido: string): Promise<number> =>
  Number((await uma<{ n: string }>(
    `select count(*)::text as n from public.movimentos_insumo where pedido_id = $1 and tipo = 'consumo'`,
    [pedido],
  )).n)

d('baixa de estoque na efetivacao (trigger 0055)', () => {
  let m: Mundo
  let s: Semeado
  const lojas: string[] = []

  beforeAll(async () => {
    m = await montarMundo()
    s = await semearEstoque(m.A.loja)
    lojas.push(m.A.loja, m.B.loja)
  })
  afterAll(async () => {
    if (!m) return
    // Limpa os movimentos (FK sem cascade para pedidos) antes do teardown compartilhado.
    await poolSuper.query('delete from public.movimentos_item_estoque where loja_id = any($1)', [lojas])
    await poolSuper.query('delete from public.movimentos_insumo where loja_id = any($1)', [lojas])
    await encerrar(m)
  })

  const pedir = async (itemId: string, quantidade: number) => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', {
      cliente_id: m.A.cliente, modalidade: 'retirada', taxa_entrega_centavos: 0,
      itens: [{ item_id: itemId, quantidade }],
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    return r.corpo as { id: string }
  }

  it('item com controle e sem ficha: decrementa so o contador e grava movimento venda', async () => {
    const p = await pedir(s.contado, 3)
    expect(await qtdItem(s.contado)).toBe(7) // 10 - 3
    expect(await movsVenda(p.id, s.contado)).toBe(1)
    expect(await movsConsumo(p.id)).toBe(0) // sem ficha
  })

  it('item com ficha tecnica: decrementa contador e explode insumos (consumo somado)', async () => {
    const p = await pedir(s.ficha, 3)
    expect(await qtdItem(s.ficha)).toBe(17) // 20 - 3
    expect(await qtdInsumo(s.pao)).toBe(94) // 100 - 2*3
    expect(await qtdInsumo(s.carne)).toBe(47) // 50 - 1*3
    expect(await movsVenda(p.id, s.ficha)).toBe(1)
    expect(await movsConsumo(p.id)).toBe(2) // pao e carne
  })

  it('estoque ilimitado (quantidade NULL): nao decrementa nem grava movimento', async () => {
    const p = await pedir(s.ilimitado, 5)
    expect(await qtdItem(s.ilimitado)).toBeNull()
    expect(await movsVenda(p.id, s.ilimitado)).toBe(0)
  })

  it('oversell: pedido que excede o saldo do item e recusado (409), saldo intacto', async () => {
    // so ha 1 unidade; pedir 3 nao efetiva nem decrementa (historia 03, regra 3).
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', {
      cliente_id: m.A.cliente, modalidade: 'retirada', taxa_entrega_centavos: 0,
      itens: [{ item_id: s.insuf, quantidade: 3 }],
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(409)
    expect(r.corpo.error.code).toBe('estoque_insuficiente')
    expect(await qtdItem(s.insuf)).toBe(1) // intacto
    // vender exatamente o saldo ainda passa e zera o item.
    const ok = await pedir(s.insuf, 1)
    expect(await qtdItem(s.insuf)).toBe(0)
    expect(await movsVenda(ok.id, s.insuf)).toBe(1)
  })

  it('idempotencia: UPDATE que mantem novo nao da baixa em dobro', async () => {
    const p = await pedir(s.contado, 1)
    const depois = await qtdItem(s.contado) // 7 (teste 1) - 1 = 6
    // Dispara o trigger de novo mantendo status 'novo' (ex.: recalculo de totais).
    await poolSuper.query(`update public.pedidos set observacao = 'reforcar' where id = $1`, [p.id])
    expect(await qtdItem(s.contado)).toBe(depois) // inalterado
    expect(await movsVenda(p.id, s.contado)).toBe(1) // um unico movimento
  })

  it('caminho do atendente (rascunho -> novo) tambem baixa ao confirmar', async () => {
    const codigo = `RA-${Date.now().toString().slice(-6)}`
    const pedido = (await uma(
      `insert into public.pedidos
         (loja_id, cliente_id, codigo, status, origem, modalidade, subtotal_centavos, taxa_entrega_centavos, total_centavos)
       values ($1,$2,$3,'rascunho','whatsapp','retirada',500,0,500) returning id`,
      [m.A.loja, m.A.cliente, codigo],
    )).id
    await poolSuper.query(
      `insert into public.itens_pedido
         (pedido_id, loja_id, item_id, nome_snapshot, preco_unitario_centavos, quantidade, total_centavos)
       values ($1,$2,$3,'Agua',500,2,1000)`,
      [pedido, m.A.loja, s.contado],
    )
    const antes = await qtdItem(s.contado)
    const r = await chamar(m, m.dono, m.A.loja, 'POST', `/${pedido}/status`, { para: 'novo' })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(await qtdItem(s.contado)).toBe((antes ?? 0) - 2)
    expect(await movsVenda(pedido, s.contado)).toBe(1)
  })
})
