// Integracao do fechamento do dia: materializacao idempotente (borda UTC x Sao_Paulo), ajuste
// manual append-only, total derivado, pagar idempotente e trava do dia pago, resumo e SEC-030/033.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hojeSp } from '@whaviso/shared/datas'
import { poolApi, poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, semearPedidoEntregue, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[motoboys] banco inacessivel: integracao PULADA.')

// 2026-03-10 02:30Z = 09/03 23:30 em Sao_Paulo (UTC-3); 03:10Z = 10/03 00:10.
const DIA = '2026-03-10'
const DIA_ANTERIOR = '2026-03-09'

d('modulo motoboys (fechamento)', () => {
  let m: Mundo
  let motoboyId = ''
  let fechamentoId = ''

  beforeAll(async () => {
    m = await montarMundo()
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', { pessoa_id: m.A.pessoaMotoboy })
    motoboyId = r.corpo.id
    const loja = m.A.loja
    const zona = m.A.zona
    await semearPedidoEntregue(loja, { motoboyId, zonaId: zona, entregueEmUtc: '2026-03-10T02:30:00Z' }) // dia 09
    await semearPedidoEntregue(loja, { motoboyId, zonaId: zona, entregueEmUtc: '2026-03-10T03:10:00Z' }) // dia 10
    await semearPedidoEntregue(loja, { motoboyId, zonaId: null, entregueEmUtc: '2026-03-10T15:00:00Z' }) // dia 10, sem zona
    await semearPedidoEntregue(loja, { motoboyId: null, zonaId: zona, entregueEmUtc: '2026-03-10T16:00:00Z' }) // sem motoboy
    await semearPedidoEntregue(loja, { motoboyId, zonaId: zona, entregueEmUtc: '2026-03-10T17:00:00Z', status: 'saiu_entrega' })
  })
  afterAll(async () => { if (m) await encerrar(m) })

  const get = (data: string, user = m.dono, loja = m.A.loja) =>
    chamar(m, user, loja, 'GET', `/fechamentos?data=${data}`)

  it('materializa so entregas do dia de negocio (borda 23:30 x 00:10); sem zona vale 0', async () => {
    const dia10 = await get(DIA)
    expect(dia10.status, JSON.stringify(dia10.corpo)).toBe(200)
    expect(dia10.corpo.linhas).toHaveLength(1)
    const l = dia10.corpo.linhas[0]
    expect(l).toMatchObject({ motoboy_id: motoboyId, status: 'aberto', qtd_entregas: 2, entregas_centavos: 700, ajustes_centavos: 0, total_centavos: 700 })
    expect(dia10.corpo.total_centavos).toBe(700)
    fechamentoId = l.id
    const valores = l.lancamentos.map((x: { valor_centavos: number }) => x.valor_centavos).sort()
    expect(valores).toEqual([0, 700])

    const dia09 = await get(DIA_ANTERIOR)
    expect(dia09.corpo.linhas[0]).toMatchObject({ qtd_entregas: 1, total_centavos: 700 })
  })

  it('rodar de novo nao duplica (idempotente)', async () => {
    const r = await get(DIA)
    expect(r.corpo.linhas[0].qtd_entregas).toBe(2)
    expect(r.corpo.linhas[0].total_centavos).toBe(700)
    const { rows } = await poolSuper.query(
      "select count(*)::int as n from public.motoboy_lancamentos where loja_id = $1 and tipo = 'entrega'", [m.A.loja],
    )
    expect(rows[0].n).toBe(3)
  })

  it('lancamento manual com sinal; total derivado = soma; nunca edita linha anterior', async () => {
    const menos = await chamar(m, m.dono, m.A.loja, 'POST', `/${motoboyId}/lancamentos`, {
      data: DIA, valor_centavos: -200, descricao: 'Desconto capacete',
    })
    expect(menos.status, JSON.stringify(menos.corpo)).toBe(201)
    expect(menos.corpo).toMatchObject({ tipo: 'ajuste', valor_centavos: -200, pedido_id: null })
    const mais = await chamar(m, m.gerente, m.A.loja, 'POST', `/${motoboyId}/lancamentos`, {
      data: DIA, valor_centavos: 1000, descricao: 'Bonus chuva',
    })
    expect(mais.status).toBe(201)
    const r = await get(DIA)
    expect(r.corpo.linhas[0]).toMatchObject({ ajustes_centavos: 800, total_centavos: 1500 })
    expect(r.corpo.linhas[0].lancamentos).toHaveLength(4)
    expect(r.corpo.total_centavos).toBe(1500)
  })

  it('validacao: descricao obrigatoria, valor zero, data futura, motoboy de outra loja', async () => {
    const p = (corpo: unknown, user = m.dono, loja = m.A.loja) =>
      chamar(m, user, loja, 'POST', `/${motoboyId}/lancamentos`, corpo)
    expect((await p({ valor_centavos: 100 })).status).toBe(400)
    expect((await p({ valor_centavos: 100, descricao: '  ' })).status).toBe(400)
    expect((await p({ valor_centavos: 0, descricao: 'x' })).status).toBe(400)
    expect((await p({ valor_centavos: 1.5, descricao: 'x' })).status).toBe(400)
    const fut = await p({ valor_centavos: 100, descricao: 'x', data: '2999-01-01' })
    expect(fut.status).toBe(422)
    expect(fut.corpo.error.code).toBe('data_futura')
    expect((await p({ valor_centavos: 100, descricao: 'x' }, m.donoB, m.B.loja)).status).toBe(404)
    expect((await p({ valor_centavos: 100, descricao: 'x' }, m.atendente)).status).toBe(403)
  })

  it('pagar: total desatualizado 409; confere 200; idempotente; sem outra loja', async () => {
    const errado = await chamar(m, m.dono, m.A.loja, 'POST', `/fechamentos/${fechamentoId}/pagar`, { total_centavos: 700 })
    expect(errado.status).toBe(409)
    expect(errado.corpo.error.code).toBe('total_divergente')

    const outraLoja = await chamar(m, m.donoB, m.B.loja, 'POST', `/fechamentos/${fechamentoId}/pagar`, { total_centavos: 1500 })
    expect(outraLoja.status).toBe(404)

    const ok = await chamar(m, m.dono, m.A.loja, 'POST', `/fechamentos/${fechamentoId}/pagar`, { total_centavos: 1500 })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(200)
    expect(ok.corpo).toMatchObject({ status: 'pago', total_centavos: 1500 })
    expect(ok.corpo.pago_em).toBeTruthy()

    const de_novo = await chamar(m, m.dono, m.A.loja, 'POST', `/fechamentos/${fechamentoId}/pagar`, { total_centavos: 1500 })
    expect(de_novo.status).toBe(200)
    expect(de_novo.corpo.pago_em).toBe(ok.corpo.pago_em)
    const { rows } = await poolSuper.query(
      "select count(*)::int as n from public.eventos where entidade_id = $1 and tipo = 'fechamento.pago'", [fechamentoId],
    )
    expect(rows[0].n).toBe(1)
  })

  it('dia pago rejeita lancamento novo (409); o dia corrente segue aberto', async () => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', `/${motoboyId}/lancamentos`, {
      data: DIA, valor_centavos: 100, descricao: 'tarde demais',
    })
    expect(r.status).toBe(409)
    expect(r.corpo.error.code).toBe('dia_ja_pago')
    const hoje = await chamar(m, m.dono, m.A.loja, 'POST', `/${motoboyId}/lancamentos`, {
      valor_centavos: 100, descricao: 'correcao no dia corrente',
    })
    expect(hoje.status).toBe(201)
    expect(hoje.corpo.data).toBe(hojeSp())
    expect((await get(DIA)).corpo.linhas[0].total_centavos).toBe(1500)
  })

  it('resumo por periodo: total por motoboy, read-only, janela limitada', async () => {
    const r = await chamar(m, m.dono, m.A.loja, 'GET', `/fechamentos/resumo?de=${DIA_ANTERIOR}&ate=${DIA}`)
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(r.corpo.itens).toHaveLength(1)
    expect(r.corpo.itens[0]).toMatchObject({ motoboy_id: motoboyId, qtd_entregas: 3, entregas_centavos: 1400, ajustes_centavos: 800, total_centavos: 2200 })
    expect(r.corpo.total_centavos).toBe(2200)
    const invertido = await chamar(m, m.dono, m.A.loja, 'GET', `/fechamentos/resumo?de=${DIA}&ate=${DIA_ANTERIOR}`)
    expect(invertido.status).toBe(422)
    const longo = await chamar(m, m.dono, m.A.loja, 'GET', '/fechamentos/resumo?de=2025-01-01&ate=2026-03-10')
    expect(longo.status).toBe(422)
    expect(longo.corpo.error.code).toBe('periodo_invalido')
  })

  it('isolamento: loja B nao ve fechamento da A; atendente 403; data invalida 400', async () => {
    const b = await get(DIA, m.donoB, m.B.loja)
    expect(b.corpo.linhas).toEqual([])
    expect((await get(DIA, m.atendente)).status).toBe(403)
    expect((await get('2026-13-40')).status).toBe(400)
  })

  it('SEC-033/030: UPDATE em lancamento dispara excecao; whaviso_api sem DELETE', async () => {
    await expect(poolApi.query('update public.motoboy_lancamentos set valor_centavos = 1 where loja_id = $1', [m.A.loja]))
      .rejects.toThrow()
    await expect(poolApi.query('delete from public.motoboy_lancamentos where loja_id = $1', [m.A.loja])).rejects.toThrow()
    await expect(poolApi.query('delete from public.fechamentos where loja_id = $1', [m.A.loja])).rejects.toThrow()
    await expect(poolApi.query('delete from public.motoboys where loja_id = $1', [m.A.loja])).rejects.toThrow()
  })
})
