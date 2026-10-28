// Lancamentos manuais a pagar (role whaviso_api, Postgres local). Cobre credor coerente
// (fornecedor|pessoa), nome do credor por read-model, filtros, idempotencia por chave, edicao so
// enquanto a_pagar, e pagar idempotente com guarda de valor divergente.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip
if (!online) console.warn('[contas_pagar/contas] banco inacessivel: integracao PULADA.')

d('contas_pagar: lancamentos', () => {
  let m: Mundo
  let fornecedorId = ''

  const novoFornecedor = async (nome: string) =>
    (await chamar(m, m.dono, m.A.loja, 'POST', '', { nome })).corpo.id as string

  beforeAll(async () => {
    m = await montarMundo()
    fornecedorId = await novoFornecedor('Fornecedor Base')
  })
  afterAll(async () => {
    if (m) await encerrar(m)
  })

  it('lanca conta de fornecedor: status a_pagar, credor_nome do fornecedor (read-model)', async () => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/contas', {
      credor_tipo: 'fornecedor', credor_id: fornecedorId, descricao: 'Compra de embalagens',
      valor_centavos: 15_000, vencimento: '2026-11-10', competencia: '2026-11-01',
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    expect(r.corpo).toMatchObject({
      credor_tipo: 'fornecedor', credor_id: fornecedorId, credor_nome: 'Fornecedor Base',
      descricao: 'Compra de embalagens', valor_centavos: 15_000, vencimento: '2026-11-10',
      competencia: '2026-11-01', status: 'a_pagar', pago_em: null,
    })
  })

  it('lanca conta de pessoa: credor_nome vem da pessoa (sem importar o modulo pessoas)', async () => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/contas', {
      credor_tipo: 'pessoa', credor_id: m.A.pessoa, descricao: 'Diaria de ajudante', valor_centavos: 8_000,
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    expect(r.corpo).toMatchObject({ credor_tipo: 'pessoa', credor_id: m.A.pessoa, credor_nome: 'Prestador A' })
  })

  it('credor inexistente ou de outra loja: 404 (fornecedor e pessoa)', async () => {
    const semForn = await chamar(m, m.dono, m.A.loja, 'POST', '/contas', {
      credor_tipo: 'fornecedor', credor_id: m.B.pessoa, descricao: 'x', valor_centavos: 100,
    })
    expect(semForn.status).toBe(404)
    const pessoaDaB = await chamar(m, m.dono, m.A.loja, 'POST', '/contas', {
      credor_tipo: 'pessoa', credor_id: m.B.pessoa, descricao: 'x', valor_centavos: 100,
    })
    expect(pessoaDaB.status).toBe(404)
  })

  it('fornecedor arquivado nao aceita lancamento (422 fornecedor_inativo)', async () => {
    const f = await novoFornecedor('Vai Arquivar')
    await chamar(m, m.dono, m.A.loja, 'POST', `/${f}/desativar`)
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/contas', {
      credor_tipo: 'fornecedor', credor_id: f, descricao: 'x', valor_centavos: 100,
    })
    expect(r.status).toBe(422)
    expect(r.corpo.error.code).toBe('fornecedor_inativo')
  })

  it('idempotencia: mesma chave duas vezes = mesma conta, sem 2a linha nem 2o evento', async () => {
    const corpo = {
      credor_tipo: 'fornecedor', credor_id: fornecedorId, descricao: 'Aluguel', valor_centavos: 200_000,
      chave_idempotencia: 'cp-aluguel-1',
    }
    const r1 = await chamar(m, m.dono, m.A.loja, 'POST', '/contas', corpo)
    const r2 = await chamar(m, m.dono, m.A.loja, 'POST', '/contas', corpo)
    expect(r1.status, JSON.stringify(r1.corpo)).toBe(201)
    expect(r2.status).toBe(201)
    expect(r2.corpo.id).toBe(r1.corpo.id)

    const linhas = await poolSuper.query<{ n: number }>(
      'select count(*)::int as n from public.contas_pagar where loja_id = $1 and chave_idempotencia = $2',
      [m.A.loja, 'cp-aluguel-1'])
    expect(linhas.rows[0]!.n).toBe(1)
    const ev = await poolSuper.query<{ n: number }>(
      "select count(*)::int as n from public.eventos where loja_id = $1 and tipo = 'conta_pagar.criada' and entidade_id = $2",
      [m.A.loja, r1.corpo.id])
    expect(ev.rows[0]!.n).toBe(1)
  })

  it('lista com filtros por credor_tipo e status; ordena por vencimento', async () => {
    const todas = (await chamar(m, m.dono, m.A.loja, 'GET', '/contas')).corpo.itens as { credor_tipo: string }[]
    expect(todas.length).toBeGreaterThan(0)
    const soFornecedor = (await chamar(m, m.dono, m.A.loja, 'GET', '/contas?credor_tipo=fornecedor')).corpo.itens as { credor_tipo: string }[]
    expect(soFornecedor.every((c) => c.credor_tipo === 'fornecedor')).toBe(true)
    const soAPagar = (await chamar(m, m.dono, m.A.loja, 'GET', '/contas?status=a_pagar')).corpo.itens as { status: string }[]
    expect(soAPagar.every((c) => c.status === 'a_pagar')).toBe(true)
  })

  it('PATCH edita enquanto a_pagar; depois de paga, 409 conta_ja_paga', async () => {
    const conta = (await chamar(m, m.dono, m.A.loja, 'POST', '/contas', {
      credor_tipo: 'fornecedor', credor_id: fornecedorId, descricao: 'Edita', valor_centavos: 5_000,
    })).corpo
    const editada = await chamar(m, m.dono, m.A.loja, 'PATCH', `/contas/${conta.id}`, {
      descricao: 'Editada', valor_centavos: 6_000, vencimento: '2026-12-01',
    })
    expect(editada.status, JSON.stringify(editada.corpo)).toBe(200)
    expect(editada.corpo).toMatchObject({ descricao: 'Editada', valor_centavos: 6_000, vencimento: '2026-12-01' })

    const paga = await chamar(m, m.dono, m.A.loja, 'POST', `/contas/${conta.id}/pagar`, { valor_centavos: 6_000 })
    expect(paga.status, JSON.stringify(paga.corpo)).toBe(200)
    expect(paga.corpo.status).toBe('pago')
    expect(paga.corpo.pago_em).not.toBeNull()

    const depois = await chamar(m, m.dono, m.A.loja, 'PATCH', `/contas/${conta.id}`, { valor_centavos: 7_000 })
    expect(depois.status).toBe(409)
    expect(depois.corpo.error.code).toBe('conta_ja_paga')
  })

  it('pagar: 409 total_divergente se o valor mudou; idempotente se ja paga', async () => {
    const conta = (await chamar(m, m.dono, m.A.loja, 'POST', '/contas', {
      credor_tipo: 'fornecedor', credor_id: fornecedorId, descricao: 'Paga', valor_centavos: 9_000,
    })).corpo
    const divergente = await chamar(m, m.dono, m.A.loja, 'POST', `/contas/${conta.id}/pagar`, { valor_centavos: 8_000 })
    expect(divergente.status).toBe(409)
    expect(divergente.corpo.error.code).toBe('total_divergente')

    const ok = await chamar(m, m.dono, m.A.loja, 'POST', `/contas/${conta.id}/pagar`, { valor_centavos: 9_000 })
    expect(ok.status).toBe(200)
    expect(ok.corpo.status).toBe('pago')
    // Repagar com o mesmo valor visto: idempotente (segue pago, sem erro).
    const dedup = await chamar(m, m.dono, m.A.loja, 'POST', `/contas/${conta.id}/pagar`, { valor_centavos: 9_000 })
    expect(dedup.status).toBe(200)
    expect(dedup.corpo.status).toBe('pago')
  })

  it('isolamento: loja B nao ve as contas da loja A', async () => {
    const listaB = (await chamar(m, m.donoB, m.B.loja, 'GET', '/contas')).corpo.itens as unknown[]
    expect(listaB).toHaveLength(0)
  })
})
