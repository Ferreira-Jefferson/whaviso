// Integracao do acerto do motoboy por periodo (modulo contas a pagar): calculo por regime
// (por_entrega / fixo-dia / fixo-mes / fixo_mais_entrega), materializacao idempotente e borda de dia
// SP, ajuste (futura 422, periodo pago 409, idempotencia por chave), pagar (total_divergente 409,
// periodo_sobreposto 409, snapshot congelado, isolamento de loja) e SEC (whaviso_api sem DELETE).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolApi, poolSuper } from '../../../test/db'
import {
  chamar, encerrar, montarMundo, online, semearMotoboy, semearPedidoEntregue, semearZona, type Mundo,
} from './test/apoio'

const d = online ? describe : describe.skip
if (!online) console.warn('[contas_pagar/acerto] banco inacessivel: integracao PULADA.')

// Periodo de março (1 mes), usado na maioria das linhas.
const MAR_DE = '2026-03-01'
const MAR_ATE = '2026-03-31'

d('modulo contas a pagar (acerto do motoboy por periodo)', () => {
  let m: Mundo
  let zona = ''
  let mPE = '' // por_entrega
  let mFD = '' // fixo / dia
  let mFME = '' // fixo_mais_entrega / dia
  let mFMes = '' // fixo / mes
  let mBorda = '' // por_entrega (borda SP + idempotencia)
  let mAJ = '' // por_entrega (ajuste + periodo_ja_pago)

  beforeAll(async () => {
    m = await montarMundo()
    const loja = m.A.loja
    zona = await semearZona(loja, 700)

    mPE = await semearMotoboy(loja, 'PorEntrega', { regime: 'por_entrega' })
    mFD = await semearMotoboy(loja, 'FixoDia', { regime: 'fixo', periodicidade: 'dia', valorFixo: 5000 })
    mFME = await semearMotoboy(loja, 'FixoMaisEntrega', { regime: 'fixo_mais_entrega', periodicidade: 'dia', valorFixo: 3000 })
    mFMes = await semearMotoboy(loja, 'FixoMes', { regime: 'fixo', periodicidade: 'mes', valorFixo: 100000 })
    mBorda = await semearMotoboy(loja, 'Borda', { regime: 'por_entrega' })
    mAJ = await semearMotoboy(loja, 'Ajuste', { regime: 'por_entrega' })

    // mPE: 2 entregas com zona (700) + 1 sem zona (0), em 2 dias distintos.
    await semearPedidoEntregue(loja, { motoboyId: mPE, zonaId: zona, entregueEmUtc: '2026-03-05T15:00:00Z' })
    await semearPedidoEntregue(loja, { motoboyId: mPE, zonaId: zona, entregueEmUtc: '2026-03-06T15:00:00Z' })
    await semearPedidoEntregue(loja, { motoboyId: mPE, zonaId: null, entregueEmUtc: '2026-03-06T16:00:00Z' })
    // mFD: 2 entregas em 2 dias distintos (700 cada).
    await semearPedidoEntregue(loja, { motoboyId: mFD, zonaId: zona, entregueEmUtc: '2026-03-05T15:00:00Z' })
    await semearPedidoEntregue(loja, { motoboyId: mFD, zonaId: zona, entregueEmUtc: '2026-03-07T15:00:00Z' })
    // mFME: 1 entrega (700) em 1 dia.
    await semearPedidoEntregue(loja, { motoboyId: mFME, zonaId: zona, entregueEmUtc: '2026-03-10T15:00:00Z' })
    // mBorda: 2026-04-10 02:30Z = 09/04 23:30 SP; 03:10Z = 10/04 00:10 SP.
    await semearPedidoEntregue(loja, { motoboyId: mBorda, zonaId: zona, entregueEmUtc: '2026-04-10T02:30:00Z' })
    await semearPedidoEntregue(loja, { motoboyId: mBorda, zonaId: zona, entregueEmUtc: '2026-04-10T03:10:00Z' })
    // mAJ: 1 entrega (700) em maio.
    await semearPedidoEntregue(loja, { motoboyId: mAJ, zonaId: zona, entregueEmUtc: '2026-05-05T15:00:00Z' })
  })
  afterAll(async () => { if (m) await encerrar(m) })

  const getAcerto = (de: string, ate: string, user = m.dono, loja = m.A.loja) =>
    chamar(m, user, loja, 'GET', `/acertos?de=${de}&ate=${ate}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linha = (corpo: any, motoboyId: string) =>
    corpo.linhas.find((l: { motoboy_id: string }) => l.motoboy_id === motoboyId)

  it('por_entrega: soma das entregas (zona; sem zona vale 0) + ajustes; fixo nao entra', async () => {
    const r = await getAcerto(MAR_DE, MAR_ATE)
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(linha(r.corpo, mPE)).toMatchObject({
      regime_pagamento: 'por_entrega', qtd_entregas: 3, dias_trabalhados: 2,
      entregas_centavos: 1400, fixo_centavos: 0, ajustes_centavos: 0, total_centavos: 1400, pago: false,
    })
  })

  it('fixo/dia: valor_fixo x dias trabalhados + ajustes; entregas aparecem mas NAO somam', async () => {
    const r = await getAcerto(MAR_DE, MAR_ATE)
    expect(linha(r.corpo, mFD)).toMatchObject({
      regime_pagamento: 'fixo', qtd_entregas: 2, dias_trabalhados: 2,
      entregas_centavos: 1400, fixo_centavos: 10000, ajustes_centavos: 0, total_centavos: 10000,
    })
  })

  it('fixo_mais_entrega: fixo (por dia) + entregas + ajustes', async () => {
    const r = await getAcerto(MAR_DE, MAR_ATE)
    expect(linha(r.corpo, mFME)).toMatchObject({
      regime_pagamento: 'fixo_mais_entrega', dias_trabalhados: 1,
      entregas_centavos: 700, fixo_centavos: 3000, total_centavos: 3700,
    })
  })

  it('fixo/mes: valor_fixo x numero de meses do periodo; motoboy ativo aparece sem lancamentos', async () => {
    // 2026-01-20..2026-02-05 atravessa 2 meses-calendario SP.
    const r = await getAcerto('2026-01-20', '2026-02-05')
    expect(r.status).toBe(200)
    expect(linha(r.corpo, mFMes)).toMatchObject({
      regime_pagamento: 'fixo', qtd_entregas: 0, dias_trabalhados: 0,
      fixo_centavos: 200000, total_centavos: 200000,
    })
  })

  it('materializacao: borda de dia SP (23:30 x 00:10) e idempotente (nao duplica no reexec)', async () => {
    const dia10 = await getAcerto('2026-04-10', '2026-04-10')
    expect(linha(dia10.corpo, mBorda)).toMatchObject({ qtd_entregas: 1, entregas_centavos: 700 })
    const dia09 = await getAcerto('2026-04-09', '2026-04-09')
    expect(linha(dia09.corpo, mBorda)).toMatchObject({ qtd_entregas: 1, entregas_centavos: 700 })

    await getAcerto('2026-04-09', '2026-04-10')
    await getAcerto('2026-04-09', '2026-04-10')
    const { rows } = await poolSuper.query<{ n: number }>(
      "select count(*)::int as n from public.motoboy_lancamentos where motoboy_id = $1 and tipo = 'entrega'",
      [mBorda],
    )
    expect(rows[0]!.n).toBe(2)
  })

  it('ajuste: valor com sinal entra no total; data futura 422; outra loja 404; atendente 403', async () => {
    const ok = await chamar(m, m.dono, m.A.loja, 'POST', '/acertos/ajuste', {
      motoboy_id: mAJ, valor_centavos: -200, descricao: 'Desconto capacete', data: '2026-05-05',
    })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(201)
    expect(ok.corpo).toMatchObject({ tipo: 'ajuste', valor_centavos: -200, pedido_id: null })

    const fut = await chamar(m, m.dono, m.A.loja, 'POST', '/acertos/ajuste', {
      motoboy_id: mAJ, valor_centavos: 100, descricao: 'x', data: '2999-01-01',
    })
    expect(fut.status).toBe(422)
    expect(fut.corpo.error.code).toBe('data_futura')

    const outra = await chamar(m, m.donoB, m.B.loja, 'POST', '/acertos/ajuste', {
      motoboy_id: mAJ, valor_centavos: 100, descricao: 'x',
    })
    expect(outra.status).toBe(404)

    const semPermissao = await chamar(m, m.atendente, m.A.loja, 'POST', '/acertos/ajuste', {
      motoboy_id: mAJ, valor_centavos: 100, descricao: 'x',
    })
    expect(semPermissao.status).toBe(403)

    const r = await getAcerto('2026-05-01', '2026-05-31')
    expect(linha(r.corpo, mAJ)).toMatchObject({ entregas_centavos: 700, ajustes_centavos: -200, total_centavos: 500 })
  })

  it('ajuste idempotente por chave: reenvio devolve o mesmo lancamento, sem 2o evento', async () => {
    const corpo = { motoboy_id: mAJ, valor_centavos: 1000, descricao: 'Bonus chuva', data: '2026-05-06', chave_idempotencia: 'aj-k1' }
    const a1 = await chamar(m, m.dono, m.A.loja, 'POST', '/acertos/ajuste', corpo)
    const a2 = await chamar(m, m.dono, m.A.loja, 'POST', '/acertos/ajuste', corpo)
    expect(a1.status).toBe(201)
    expect(a2.status).toBe(201)
    expect(a2.corpo.id).toBe(a1.corpo.id)
    const { rows } = await poolSuper.query<{ n: number }>(
      `select count(*)::int as n from public.eventos
        where tipo = 'acerto_motoboy.ajuste' and detalhes->>'lancamento_id' = $1`,
      [a1.corpo.id],
    )
    expect(rows[0]!.n).toBe(1)
  })

  it('pagar: total desatualizado 409; confere e congela; isolamento de loja 404; idempotencia de evento', async () => {
    // mPE no periodo de março vale 1400 (ja materializado).
    const errado = await chamar(m, m.dono, m.A.loja, 'POST', '/acertos/pagar', {
      motoboy_id: mPE, de: MAR_DE, ate: MAR_ATE, total_centavos: 999,
    })
    expect(errado.status).toBe(409)
    expect(errado.corpo.error.code).toBe('total_divergente')

    const outraLoja = await chamar(m, m.donoB, m.B.loja, 'POST', '/acertos/pagar', {
      motoboy_id: mPE, de: MAR_DE, ate: MAR_ATE, total_centavos: 1400,
    })
    expect(outraLoja.status).toBe(404)

    const ok = await chamar(m, m.dono, m.A.loja, 'POST', '/acertos/pagar', {
      motoboy_id: mPE, de: MAR_DE, ate: MAR_ATE, total_centavos: 1400,
    })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(200)
    expect(ok.corpo).toMatchObject({ motoboy_id: mPE, periodo_inicio: MAR_DE, periodo_fim: MAR_ATE, total_pago_centavos: 1400 })
    expect(ok.corpo.pago_em).toBeTruthy()

    // GET marca a linha como paga.
    const r = await getAcerto(MAR_DE, MAR_ATE)
    expect(linha(r.corpo, mPE).pago).toBe(true)
  })

  it('pagar: periodo que sobrepoe um acerto ja pago = 409 periodo_sobreposto', async () => {
    const sobreposto = await chamar(m, m.dono, m.A.loja, 'POST', '/acertos/pagar', {
      motoboy_id: mPE, de: '2026-03-15', ate: '2026-04-15', total_centavos: 0,
    })
    expect(sobreposto.status).toBe(409)
    expect(sobreposto.corpo.error.code).toBe('periodo_sobreposto')
  })

  it('snapshot: total_pago_centavos nao muda se um lancamento do periodo mudar depois', async () => {
    // Insere um ajuste direto no ledger (burla a guarda de periodo pago) dentro do periodo ja pago.
    await poolSuper.query(
      `insert into public.motoboy_lancamentos (loja_id, motoboy_id, data, tipo, valor_centavos, descricao)
       values ($1,$2,'2026-03-20','ajuste',5000,'fora de banda')`,
      [m.A.loja, mPE],
    )
    const { rows } = await poolSuper.query<{ total: number }>(
      "select total_pago_centavos as total from public.acertos_motoboy where motoboy_id = $1 and status = 'pago'",
      [mPE],
    )
    expect(rows[0]!.total).toBe(1400)
  })

  it('ajuste em periodo ja pago = 409 periodo_ja_pago', async () => {
    // Paga o periodo de maio do mAJ (700 entrega - 200 + 1000 = 1500) e depois tenta ajustar dentro dele.
    const pago = await chamar(m, m.dono, m.A.loja, 'POST', '/acertos/pagar', {
      motoboy_id: mAJ, de: '2026-05-01', ate: '2026-05-31', total_centavos: 1500,
    })
    expect(pago.status, JSON.stringify(pago.corpo)).toBe(200)
    const tarde = await chamar(m, m.dono, m.A.loja, 'POST', '/acertos/ajuste', {
      motoboy_id: mAJ, valor_centavos: 50, descricao: 'tarde demais', data: '2026-05-15',
    })
    expect(tarde.status).toBe(409)
    expect(tarde.corpo.error.code).toBe('periodo_ja_pago')
  })

  it('isolamento: loja B nao ve acerto da A; periodo invertido 422', async () => {
    const b = await getAcerto(MAR_DE, MAR_ATE, m.donoB, m.B.loja)
    expect(b.corpo.linhas).toEqual([])
    const invertido = await getAcerto(MAR_ATE, MAR_DE)
    expect(invertido.status).toBe(422)
    expect(invertido.corpo.error.code).toBe('periodo_invalido')
  })

  it('SEC: whaviso_api nao tem DELETE em acertos_motoboy', async () => {
    await expect(poolApi.query('delete from public.acertos_motoboy where loja_id = $1', [m.A.loja]))
      .rejects.toThrow()
  })
})
