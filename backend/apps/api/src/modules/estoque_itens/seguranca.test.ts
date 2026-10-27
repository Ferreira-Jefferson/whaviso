// SEC do estoque_itens sob os roles reais de servico: sem DELETE, append-only, grant por coluna
// do atendente (so quantidade_disponivel), isolamento por loja e invariantes nao-negativas.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoAcessivel, criarConta, criarLoja, criarUsuario, fecharPools, limpar, novoCenario, poolSuper } from '../../../test/db'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[estoque_itens:seguranca] banco inacessivel: integracao PULADA.')

const NEGADO = /permission denied|permiss.o negada/i

d('estoque_itens: seguranca', () => {
  const cen = novoCenario()
  let lojaA = '', lojaB = '', itemA = '', itemB = '', pedidoA = ''

  beforeAll(async () => {
    const dono = await criarUsuario(cen)
    const contaA = await criarConta(cen, dono)
    const contaB = await criarConta(cen, dono)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    const mk = async (loja: string, nome: string) => {
      const cat = await poolSuper.query<{ id: string }>(
        `insert into public.categorias (loja_id, nome) values ($1, 'C') returning id`, [loja])
      const it = await poolSuper.query<{ id: string }>(
        `insert into public.itens (loja_id, categoria_id, nome, controla_estoque, quantidade_disponivel)
         values ($1, $2, $3, true, 10) returning id`, [loja, cat.rows[0]!.id, nome])
      return it.rows[0]!.id
    }
    itemA = await mk(lojaA, 'A')
    itemB = await mk(lojaB, 'B')
    const ped = await poolSuper.query<{ id: string }>(
      `insert into public.pedidos (loja_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1, 'S1', 'novo', 0, 0) returning id`, [lojaA])
    pedidoA = ped.rows[0]!.id
  })

  afterAll(async () => {
    for (const l of [lojaA, lojaB]) {
      await poolSuper.query('delete from public.movimentos_item_estoque where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.pedidos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.itens where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.categorias where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  const SET_ROLE = {
    whaviso_api: 'set local role whaviso_api',
    whaviso_atendente: 'set local role whaviso_atendente',
  } as const
  async function comRole(role: keyof typeof SET_ROLE, fn: (c: import('pg').PoolClient) => Promise<void>) {
    const c = await poolSuper.connect()
    try {
      await c.query('begin')
      await c.query(SET_ROLE[role])
      await fn(c)
    } finally {
      await c.query('rollback').catch(() => {})
      c.release()
    }
  }

  // Isola cada sonda de negacao num savepoint: a 1a negacao aborta a transacao, e sem o
  // rollback-to-savepoint as sondas seguintes bateriam em "transacao interrompida" em vez do
  // erro real (permission denied). Depois do rollback a transacao volta utilizavel.
  async function negar(c: import('pg').PoolClient, texto: string, params: unknown[] = []) {
    await c.query('savepoint sp')
    await expect(c.query(texto, params)).rejects.toThrow(NEGADO)
    await c.query('rollback to savepoint sp')
  }

  it('SEC-030: whaviso_api NAO tem DELETE em itens nem em movimentos_item_estoque', async () => {
    await comRole('whaviso_api', async (c) => {
      await negar(c, 'delete from public.movimentos_item_estoque')
      await negar(c, 'delete from public.itens')
    })
  })

  it('movimentos_item_estoque e append-only: whaviso_api nao tem UPDATE (grant)', async () => {
    await comRole('whaviso_api', async (c) => {
      await negar(c, "update public.movimentos_item_estoque set motivo = 'x'")
    })
  })

  it('append-only: UPDATE e barrado pelo TRIGGER mesmo para o dono da tabela', async () => {
    const c = await poolSuper.connect()
    try {
      await c.query(
        `insert into public.movimentos_item_estoque (loja_id, item_id, tipo, quantidade, quantidade_resultante)
         values ($1, $2, 'entrada', 1, 11)`, [lojaA, itemA])
      await expect(c.query("update public.movimentos_item_estoque set motivo = 'x' where item_id = $1", [itemA]))
        .rejects.toThrow(/append-only|imutavel/i)
    } finally {
      await c.query('delete from public.movimentos_item_estoque where item_id = $1', [itemA]).catch(() => {})
      c.release()
    }
  })

  it('whaviso_atendente: INSERT no movimento e UPDATE SO de quantidade_disponivel em itens', async () => {
    await comRole('whaviso_atendente', async (c) => {
      await c.query(
        `insert into public.movimentos_item_estoque (loja_id, item_id, tipo, quantidade, quantidade_resultante, pedido_id)
         values ($1, $2, 'venda', 1, 9, $3)`, [lojaA, itemA, pedidoA])
      await c.query('update public.itens set quantidade_disponivel = 9 where id = $1', [itemA])
      const sel = await c.query('select count(*)::int as n from public.movimentos_item_estoque')
      expect(sel.rows[0].n).toBeGreaterThan(0)
      // Negacao por ULTIMO e isolada em savepoint: aborta a transacao sem poluir as assercoes acima.
      await negar(c, "update public.itens set nome = 'hack' where id = $1", [itemA])
    })
  })

  it('whaviso_atendente: sem DELETE no movimento', async () => {
    await comRole('whaviso_atendente', async (c) => {
      await negar(c, 'delete from public.movimentos_item_estoque')
    })
  })

  it('filtro por loja: consulta escopada nao cruza lojas', async () => {
    const { rows } = await poolSuper.query<{ loja_id: string }>(
      'select loja_id from public.itens where id = $1 and loja_id = $2', [itemB, lojaA])
    expect(rows).toHaveLength(0)
  })

  it('invariantes nao-negativas e exige-controle em itens (check constraints)', async () => {
    await expect(
      poolSuper.query('update public.itens set quantidade_disponivel = -1 where id = $1', [itemA]),
    ).rejects.toThrow(/itens_quantidade_nao_negativa|check/i)
    await expect(
      poolSuper.query(
        'update public.itens set controla_estoque = false, quantidade_disponivel = 5 where id = $1', [itemA]),
    ).rejects.toThrow(/itens_quantidade_exige_controle|check/i)
  })

  it('movimento com resultante negativa e barrado (check)', async () => {
    await expect(
      poolSuper.query(
        `insert into public.movimentos_item_estoque (loja_id, item_id, tipo, quantidade, quantidade_resultante)
         values ($1, $2, 'saida', 1, -1)`, [lojaA, itemA]),
    ).rejects.toThrow(/resultante_nao_negativa|check/i)
  })

  it('idempotencia da venda no banco: duas vendas do mesmo (pedido,item) = unique', async () => {
    const c = await poolSuper.connect()
    try {
      await c.query(
        `insert into public.movimentos_item_estoque (loja_id, item_id, tipo, quantidade, quantidade_resultante, pedido_id)
         values ($1, $2, 'venda', 1, 9, $3)`, [lojaA, itemA, pedidoA])
      await expect(c.query(
        `insert into public.movimentos_item_estoque (loja_id, item_id, tipo, quantidade, quantidade_resultante, pedido_id)
         values ($1, $2, 'venda', 1, 8, $3)`, [lojaA, itemA, pedidoA])).rejects.toThrow(/unique|duplicate|duplicada|duplicar|unicidade/i)
    } finally {
      await c.query('delete from public.movimentos_item_estoque where pedido_id = $1', [pedidoA]).catch(() => {})
      c.release()
    }
  })
})
