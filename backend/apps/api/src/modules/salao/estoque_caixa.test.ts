// Salao (historia 07): item esgotado nao e lancado (regra 3); fechar a comanda da baixa de estoque
// de item e insumo (mesma regra da venda) e lanca o recebimento no caixa (regra 6), tudo atomico e
// idempotente (fechar de novo nao baixa nem lanca outra vez).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[salao/estoque] banco inacessivel: integracao PULADA.')

async function uma<T = { id: string }>(sql: string, params: unknown[]): Promise<T> {
  const r = await poolSuper.query(sql, params)
  return r.rows[0] as T
}
const qtdItem = async (id: string): Promise<number | null> =>
  (await uma<{ q: number | null }>('select quantidade_disponivel as q from public.itens where id = $1', [id])).q
const qtdInsumo = async (id: string): Promise<number> =>
  Number((await uma<{ q: string }>('select quantidade_atual::text as q from public.insumos where id = $1', [id])).q)

d('salao: estoque e caixa no fechamento (historia 07)', () => {
  let m: Mundo
  let categoria = ''

  beforeAll(async () => {
    m = await montarMundo()
    categoria = (await uma('insert into public.categorias (loja_id, nome) values ($1,$2) returning id', [m.A.loja, 'SalaoEstoque'])).id
  })
  afterAll(async () => { if (m) await encerrar(m) })

  const comoDono = (metodo: 'GET' | 'POST' | 'PATCH', url: string, corpo?: unknown) =>
    chamar(m, m.dono, m.A.loja, metodo, url, corpo)

  const abrirComandaEm = async (nomeMesa: string): Promise<string> => {
    const mesa = (await comoDono('POST', '/mesas', { nome: nomeMesa })).corpo
    const c = await comoDono('POST', '/comandas', { mesa_id: mesa.id })
    expect(c.status, JSON.stringify(c.corpo)).toBe(201)
    return c.corpo.id as string
  }

  it('item esgotado (contador zerado) nao e lancado na comanda (422 item_esgotado)', async () => {
    const zerado = (await uma(
      `insert into public.itens (loja_id, categoria_id, nome, preco_centavos, controla_estoque, quantidade_disponivel)
       values ($1,$2,'Esgotado',1000,true,0) returning id`, [m.A.loja, categoria])).id
    const comandaId = await abrirComandaEm('Mesa esgotado')
    const r = await comoDono('POST', `/comandas/${comandaId}/itens`, { item_id: zerado, quantidade: 1 })
    expect(r.status).toBe(422)
    expect(r.corpo.error.code).toBe('item_esgotado')
  })

  it('fechar a comanda baixa item + insumo e lanca no caixa; fechar de novo nao duplica', async () => {
    const item = (await uma(
      `insert into public.itens (loja_id, categoria_id, nome, preco_centavos, controla_estoque, quantidade_disponivel)
       values ($1,$2,'Prato',2000,true,10) returning id`, [m.A.loja, categoria])).id
    const insumo = (await uma(
      `insert into public.insumos (loja_id, nome, unidade, quantidade_atual, quantidade_minima)
       values ($1,'Arroz','kg',100,0) returning id`, [m.A.loja])).id
    await poolSuper.query(
      'insert into public.fichas_tecnicas (loja_id, item_id, insumo_id, quantidade, ativo) values ($1,$2,$3,$4,true)',
      [m.A.loja, item, insumo, 2],
    )

    const comandaId = await abrirComandaEm('Mesa prato')
    const lanc = await comoDono('POST', `/comandas/${comandaId}/itens`, { item_id: item, quantidade: 3 })
    expect(lanc.status, JSON.stringify(lanc.corpo)).toBe(200)
    expect(lanc.corpo.total_centavos).toBe(6000)
    // Lancar nao baixa estoque (a baixa e no fechamento).
    expect(await qtdItem(item)).toBe(10)
    expect(await qtdInsumo(insumo)).toBe(100)

    const fechar = await comoDono('POST', `/comandas/${comandaId}/fechar`, { forma_pagamento: 'pix' })
    expect(fechar.status, JSON.stringify(fechar.corpo)).toBe(200)
    // Baixa: item 10-3=7; insumo 100 - 2*3 = 94.
    expect(await qtdItem(item)).toBe(7)
    expect(await qtdInsumo(insumo)).toBe(94)
    // Recebimento no caixa (venda, pix), 1 movimento por comanda.
    const mov = await uma<{ n: string; v: number; forma: string }>(
      `select count(*)::text as n, coalesce(max(valor_centavos),0) as v, coalesce(max(forma_pagamento),'') as forma
         from public.movimentos_caixa
        where caixa_id = $1 and chave_idempotencia = $2`,
      [m.caixaA, `comanda:${comandaId}`],
    )
    expect(Number(mov.n)).toBe(1)
    expect(mov.v).toBe(6000)
    expect(mov.forma).toBe('pix')

    // Fechar de novo: 409 e nada muda (estoque e caixa inalterados).
    const dedenovo = await comoDono('POST', `/comandas/${comandaId}/fechar`, { forma_pagamento: 'pix' })
    expect(dedenovo.status).toBe(409)
    expect(await qtdItem(item)).toBe(7)
    expect(await qtdInsumo(insumo)).toBe(94)
    const movDepois = await uma<{ n: string }>(
      `select count(*)::text as n from public.movimentos_caixa where caixa_id = $1 and chave_idempotencia = $2`,
      [m.caixaA, `comanda:${comandaId}`],
    )
    expect(Number(movDepois.n)).toBe(1)
  })

  it('sem caixa aberto o fechamento e barrado (409 caixa_fechado)', async () => {
    // Fecha o caixa de A; abrir comanda e tentar fechar deve recusar.
    await poolSuper.query(
      `update public.caixas set status='fechado', fechado_por_user_id=$2, fechado_em=now(),
         saldo_informado_centavos=0, saldo_calculado_centavos=0, diferenca_centavos=0
       where id = $1`, [m.caixaA, m.dono],
    )
    const comandaId = await abrirComandaEm('Mesa sem caixa')
    const r = await comoDono('POST', `/comandas/${comandaId}/fechar`, { forma_pagamento: 'dinheiro' })
    expect(r.status).toBe(409)
    expect(r.corpo.error.code).toBe('caixa_fechado')
    // Reabre para nao afetar outros testes do arquivo (afterAll limpa tudo).
    await poolSuper.query(
      `insert into public.caixas (id, loja_id, aberto_por_user_id, saldo_inicial_centavos, status)
       values ($1,$2,$3,0,'aberto') on conflict (id) do update set status='aberto'`,
      [m.caixaA, m.A.loja, m.dono],
    )
  })
})
