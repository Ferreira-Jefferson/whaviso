// Baixa de estoque por venda (darBaixaPorVenda). Exercita a funcao pura contra o banco, pelo
// poolSuper (foca na LOGICA: decremento, movimento, piso em zero, idempotencia) de forma
// independente das decisoes de grant da 0026. Em producao o role chamador precisa dos grants
// SELECT/UPDATE em insumos e SELECT/INSERT em movimentos_insumo (ver MODULE.md).
// Depende da 0026 (insumos, movimentos_insumo) e da 0027 (fichas_tecnicas): pula se ausentes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { bancoAcessivel, fecharPools, poolSuper } from '../../../test/db'
import { darBaixaPorVenda } from './service'
import {
  criarItem, montarInsercaoInsumo, movimentosConsumo, quantidadeAtual, tabelaExiste,
} from './fixtures'

const online = await bancoAcessivel()
const temTabelas =
  online && (await tabelaExiste('fichas_tecnicas')) && (await tabelaExiste('movimentos_insumo'))
const insumo = online && temTabelas ? await montarInsercaoInsumo() : { inserivel: false, motivo: 'tabelas 0026/0027 ausentes', criar: async () => '' }
const pronto = online && temTabelas && insumo.inserivel
if (!pronto) console.warn('[ficha_tecnica/baixa] PULADA: aplicar 0026+0027 no banco de teste.')

const d = pronto ? describe : describe.skip

async function criarLojaSuper(): Promise<string> {
  // Loja isolada criada direto (sem o harness de conta): a FK de fichas_tecnicas exige lojas.id.
  const contaId = randomUUID()
  const userId = randomUUID()
  await poolSuper.query('insert into auth.users (id) values ($1)', [userId])
  await poolSuper.query('insert into public.contas (id, dono_user_id, nome) values ($1,$2,$3)', [contaId, userId, 'Baixa teste'])
  const lojaId = randomUUID()
  await poolSuper.query('insert into public.lojas (id, conta_id, nome) values ($1,$2,$3)', [lojaId, contaId, 'Loja baixa'])
  return lojaId
}

async function fichaLinha(lojaId: string, itemId: string, insumoId: string, qtd: number): Promise<void> {
  await poolSuper.query(
    `insert into public.fichas_tecnicas (loja_id, item_id, insumo_id, quantidade) values ($1,$2,$3,$4)`,
    [lojaId, itemId, insumoId, qtd],
  )
}

d('darBaixaPorVenda (integracao)', () => {
  let lojaId = '', itemId = '', insA = '', insB = ''
  const contasParaLimpar: string[] = []

  beforeAll(async () => {
    lojaId = await criarLojaSuper()
    const { rows } = await poolSuper.query<{ conta_id: string }>('select conta_id from public.lojas where id = $1', [lojaId])
    contasParaLimpar.push(rows[0]!.conta_id)
    itemId = await criarItem(lojaId)
    insA = await insumo.criar(lojaId, 100) // farinha
    insB = await insumo.criar(lojaId, 1.5) // insumo quase no fim, para testar o piso
    await fichaLinha(lojaId, itemId, insA, 0.25)
    await fichaLinha(lojaId, itemId, insB, 1)
  })

  afterAll(async () => {
    await poolSuper.query('delete from public.movimentos_insumo where loja_id = $1', [lojaId]).catch(() => {})
    await poolSuper.query('delete from public.fichas_tecnicas where loja_id = $1', [lojaId]).catch(() => {})
    await poolSuper.query('delete from public.insumos where loja_id = $1', [lojaId]).catch(() => {})
    for (const c of contasParaLimpar) await poolSuper.query('delete from public.contas where id = $1', [c]).catch(() => {})
    await fecharPools()
  })

  it('decrementa cada insumo pelo consumo e registra movimento com a quantidade resultante', async () => {
    const pedido = randomUUID()
    const r = await darBaixaPorVenda(poolSuper, { item_id: itemId, loja_id: lojaId, quantidade_vendida: 2, pedido_id: pedido })
    expect(r).toEqual({ baixados: 2, jaRegistrados: 0 })

    // insA: 100 - 0.25*2 = 99.5 ; insB: 1.5 - 1*2 -> piso 0 (nao negativo)
    expect(await quantidadeAtual(insA)).toBeCloseTo(99.5, 3)
    expect(await quantidadeAtual(insB)).toBeCloseTo(0, 3)

    const movA = await movimentosConsumo(pedido, insA)
    expect(movA).toHaveLength(1)
    expect(Number(movA[0]!.quantidade)).toBeCloseTo(0.5, 3)
    expect(Number(movA[0]!.quantidade_resultante)).toBeCloseTo(99.5, 3)
    const movB = await movimentosConsumo(pedido, insB)
    expect(Number(movB[0]!.quantidade_resultante)).toBeCloseTo(0, 3)
  })

  it('idempotente por pedido_id: reexecutar nao da baixa em dobro nem duplica movimento', async () => {
    const pedido = randomUUID()
    await darBaixaPorVenda(poolSuper, { item_id: itemId, loja_id: lojaId, quantidade_vendida: 1, pedido_id: pedido })
    const aposPrimeira = await quantidadeAtual(insA)
    const r2 = await darBaixaPorVenda(poolSuper, { item_id: itemId, loja_id: lojaId, quantidade_vendida: 1, pedido_id: pedido })
    expect(r2).toEqual({ baixados: 0, jaRegistrados: 2 })
    expect(await quantidadeAtual(insA)).toBeCloseTo(aposPrimeira, 3)
    expect(await movimentosConsumo(pedido, insA)).toHaveLength(1)
  })

  it('item sem ficha: nenhuma baixa', async () => {
    const semFicha = await criarItem(lojaId)
    const r = await darBaixaPorVenda(poolSuper, { item_id: semFicha, loja_id: lojaId, quantidade_vendida: 3, pedido_id: randomUUID() })
    expect(r).toEqual({ baixados: 0, jaRegistrados: 0 })
  })

  it('corrida: duas baixas simultaneas do MESMO pedido: um movimento por insumo, decremento uma vez', async () => {
    const pedido = randomUUID()
    const antesA = await quantidadeAtual(insA)
    // Duas baixas concorrentes do mesmo (pedido, item): o indice unico parcial (pedido_id, insumo_id)
    // where tipo='consumo' barra a duplicata; o decremento perdido reverte com o statement que falha.
    const [r1, r2] = await Promise.all([
      darBaixaPorVenda(poolSuper, { item_id: itemId, loja_id: lojaId, quantidade_vendida: 1, pedido_id: pedido }),
      darBaixaPorVenda(poolSuper, { item_id: itemId, loja_id: lojaId, quantidade_vendida: 1, pedido_id: pedido }),
    ])
    // Por insumo exatamente um lado registra; conta os totais, nao qual chamada venceu (2 linhas de ficha).
    expect(r1.baixados + r2.baixados).toBe(2)
    expect(r1.jaRegistrados + r2.jaRegistrados).toBe(2)
    // insA decrementado UMA vez (0.25 * 1); um unico movimento 'consumo' por insumo.
    expect(await quantidadeAtual(insA)).toBeCloseTo(antesA - 0.25, 3)
    expect(await movimentosConsumo(pedido, insA)).toHaveLength(1)
    expect(await movimentosConsumo(pedido, insB)).toHaveLength(1)
  })
})
