// CRUD de fornecedores (role whaviso_api, Postgres local). Cobre cifra/mascara do telefone (PII),
// revelar em claro (dono/gerente), arquivar/reativar e isolamento por loja.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip
if (!online) console.warn('[contas_pagar/fornecedores] banco inacessivel: integracao PULADA.')

d('contas_pagar: fornecedores', () => {
  let m: Mundo
  beforeAll(async () => {
    m = await montarMundo()
  })
  afterAll(async () => {
    if (m) await encerrar(m)
  })

  it('cria fornecedor com telefone: resposta so com mascara (ultimos 4), sem claro/cifrado', async () => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '', {
      nome: 'Distribuidora Boa', documento: '12.345.678/0001-90', telefone: '(11) 98888-1234',
      observacoes: 'entrega as segundas',
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    expect(r.corpo).toMatchObject({
      nome: 'Distribuidora Boa', documento: '12.345.678/0001-90',
      telefone_ultimos4: '1234', ativo: true, observacoes: 'entrega as segundas',
    })
    expect(r.body).not.toContain('98888-1234')
    expect(r.body).not.toMatch(/telefone_cifrado/)
  })

  it('banco guarda telefone so cifrado (claro ausente em qualquer coluna)', async () => {
    const f = (await chamar(m, m.dono, m.A.loja, 'POST', '', { nome: 'Cifra', telefone: '11977770000' })).corpo
    const { rows } = await poolSuper.query<{ t: string; cif: Buffer | null }>(
      'select row_to_json(x)::text as t, telefone_cifrado as cif from public.fornecedores x where id = $1', [f.id],
    )
    expect(rows[0]!.t).not.toContain('977770000')
    expect(rows[0]!.cif!.includes('977770000')).toBe(false)
  })

  it('telefone invalido no cadastro: 422 telefone_invalido', async () => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '', { nome: 'Tel ruim', telefone: '123' })
    expect(r.status).toBe(422)
    expect(r.corpo.error.code).toBe('telefone_invalido')
  })

  it('revelar telefone (dono): claro so sob a rota, com no-store', async () => {
    const f = (await chamar(m, m.dono, m.A.loja, 'POST', '', { nome: 'Revela', telefone: '11966660000' })).corpo
    const rev = await chamar(m, m.dono, m.A.loja, 'POST', `/${f.id}/telefone/revelar`)
    expect(rev.status, JSON.stringify(rev.corpo)).toBe(200)
    expect(rev.corpo.telefone).toBe('+5511966660000')
    expect(rev.headers['cache-control']).toBe('no-store')
  })

  it('revelar telefone: atendente (sem papel dono/gerente) recebe 403', async () => {
    const f = (await chamar(m, m.dono, m.A.loja, 'POST', '', { nome: 'So dono revela', telefone: '11955550000' })).corpo
    const rev = await chamar(m, m.atendente, m.A.loja, 'POST', `/${f.id}/telefone/revelar`)
    expect(rev.status).toBe(403)
  })

  it('PATCH (renomeia, limpa telefone com null) e arquivar/reativar; filtro de inativos', async () => {
    const f = (await chamar(m, m.dono, m.A.loja, 'POST', '', { nome: 'Edita', telefone: '11944440000' })).corpo
    const p = await chamar(m, m.dono, m.A.loja, 'PATCH', `/${f.id}`, { nome: 'Editado', telefone: null })
    expect(p.corpo).toMatchObject({ nome: 'Editado', telefone_ultimos4: null })
    const semTel = await chamar(m, m.dono, m.A.loja, 'POST', `/${f.id}/telefone/revelar`)
    expect(semTel.status).toBe(404)

    const arq = await chamar(m, m.dono, m.A.loja, 'POST', `/${f.id}/desativar`)
    expect(arq.corpo.ativo).toBe(false)
    const reArq = await chamar(m, m.dono, m.A.loja, 'POST', `/${f.id}/desativar`)
    expect(reArq.status).toBe(409)

    const lista = (await chamar(m, m.dono, m.A.loja, 'GET', '')).corpo.itens as { id: string }[]
    expect(lista.find((x) => x.id === f.id)).toBeUndefined()
    const comInativos = (await chamar(m, m.dono, m.A.loja, 'GET', '?incluir_inativos=true')).corpo.itens as { id: string }[]
    expect(comInativos.find((x) => x.id === f.id)).toBeTruthy()

    const rea = await chamar(m, m.dono, m.A.loja, 'POST', `/${f.id}/ativar`)
    expect(rea.corpo.ativo).toBe(true)
  })

  it('isolamento: loja B nao ve nem edita fornecedor da loja A (404)', async () => {
    const f = (await chamar(m, m.dono, m.A.loja, 'POST', '', { nome: 'So da A' })).corpo
    const visto = await chamar(m, m.donoB, m.B.loja, 'GET', `/${f.id}`)
    expect(visto.status).toBe(404)
    const listaB = (await chamar(m, m.donoB, m.B.loja, 'GET', '?incluir_inativos=true')).corpo.itens as { id: string }[]
    expect(listaB.find((x) => x.id === f.id)).toBeUndefined()
  })
})
