// CRUD de pessoas, cargos e escalas (role whaviso_api, Postgres local). Cobre cifra/mascara do
// telefone (PII), filtro de cargo utilizavel, detalhe com escalas e ciclo da escala.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip
if (!online) console.warn('[pessoas] banco inacessivel: integracao PULADA.')

interface CargoItem { id: string; chave: string | null; nome: string; sistema: boolean; ativo: boolean; loja_id: string | null }

d('pessoas: crud', () => {
  let m: Mundo
  let cozinheiraId = ''
  let motoboyId = ''

  beforeAll(async () => {
    m = await montarMundo()
    const cargos = (await chamar(m, m.dono, m.lojaA, 'GET', '/cargos')).corpo.itens as CargoItem[]
    cozinheiraId = cargos.find((c) => c.chave === 'cozinheira')!.id
    motoboyId = cargos.find((c) => c.chave === 'motoboy')!.id
  })
  afterAll(async () => {
    await encerrar(m)
  })

  it('lista cargos: presets de plataforma visiveis (loja_id null), motoboy e de sistema', async () => {
    const itens = (await chamar(m, m.dono, m.lojaA, 'GET', '/cargos')).corpo.itens as CargoItem[]
    const chaves = itens.map((c) => c.chave)
    for (const k of ['cozinheira', 'ajudante_cozinha', 'atendente', 'marmiteira', 'recepcao', 'garcom', 'motoboy']) {
      expect(chaves).toContain(k)
    }
    const motoboy = itens.find((c) => c.chave === 'motoboy')!
    expect(motoboy.sistema).toBe(true)
    expect(motoboy.loja_id).toBeNull()
  })

  it('cria cargo proprio da loja (sistema=false, loja_id = loja) e edita/arquiva', async () => {
    const criado = await chamar(m, m.dono, m.lojaA, 'POST', '/cargos', { nome: 'Chapeiro' })
    expect(criado.status).toBe(201)
    expect(criado.corpo).toMatchObject({ nome: 'Chapeiro', sistema: false, ativo: true, chave: null })
    const id = criado.corpo.id
    const renomeado = await chamar(m, m.dono, m.lojaA, 'PATCH', `/cargos/${id}`, { nome: 'Chapeiro(a)' })
    expect(renomeado.corpo.nome).toBe('Chapeiro(a)')
    const arquivado = await chamar(m, m.dono, m.lojaA, 'PATCH', `/cargos/${id}`, { ativo: false })
    expect(arquivado.corpo.ativo).toBe(false)
  })

  it('cria pessoa com cargo preset: telefone mascarado, sem claro/cifrado na resposta', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'POST', '', {
      nome: 'Dona Rita', cargo_id: cozinheiraId, telefone: '(11) 98888-1234', observacoes: 'turno manha',
    })
    expect(r.status).toBe(201)
    expect(r.corpo).toMatchObject({
      nome: 'Dona Rita', cargo_id: cozinheiraId, cargo_chave: 'cozinheira',
      telefone_mascarado: '+55 ** *****-1234', ativo: true, observacoes: 'turno manha',
    })
    expect(r.body).not.toContain('98888-1234')
    expect(r.body).not.toMatch(/telefone_cifrado/)
  })

  it('SEC-023: banco guarda telefone so cifrado (claro ausente em qualquer coluna)', async () => {
    const f = (await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Cifra', cargo_id: cozinheiraId, telefone: '11977770000' })).corpo
    const { rows } = await poolSuper.query<{ t: string; cif: Buffer }>(
      'select row_to_json(x)::text as t, telefone_cifrado as cif from public.pessoas x where id = $1', [f.id],
    )
    expect(rows[0]!.t).not.toContain('977770000')
    expect(rows[0]!.cif.includes('977770000')).toBe(false)
  })

  it('motoboy e a pessoa da entrega: cargo com chave motoboy, sem conceito duplicado', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Ze Moto', cargo_id: motoboyId })
    expect(r.status).toBe(201)
    expect(r.corpo.cargo_chave).toBe('motoboy')
  })

  it('cargo inexistente/inativo/de outra loja e recusado (422 cargo_invalido)', async () => {
    const outraLoja = await chamar(m, m.donoB, m.lojaB, 'POST', '/cargos', { nome: 'So da B' })
    const r = await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'X', cargo_id: outraLoja.corpo.id })
    expect(r.status).toBe(422)
    expect(r.corpo.error.code).toBe('cargo_invalido')
  })

  it('telefone invalido no cadastro: 422 telefone_invalido', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Y', cargo_id: cozinheiraId, telefone: '123' })
    expect(r.status).toBe(422)
    expect(r.corpo.error.code).toBe('telefone_invalido')
  })

  it('PATCH pessoa (troca cargo, limpa telefone com null, arquiva) e revelar telefone (dono)', async () => {
    const f = (await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Edita', cargo_id: cozinheiraId, telefone: '11966660000' })).corpo
    const rev1 = await chamar(m, m.dono, m.lojaA, 'POST', `/${f.id}/telefone/revelar`)
    expect(rev1.status).toBe(200)
    expect(rev1.corpo.telefone).toBe('+5511966660000')
    expect(rev1.body).toBeTruthy()
    const p = await chamar(m, m.dono, m.lojaA, 'PATCH', `/${f.id}`, { cargo_id: motoboyId, telefone: null })
    expect(p.corpo).toMatchObject({ cargo_chave: 'motoboy', telefone_mascarado: null })
    const semTel = await chamar(m, m.dono, m.lojaA, 'POST', `/${f.id}/telefone/revelar`)
    expect(semTel.status).toBe(404)
    const arq = await chamar(m, m.dono, m.lojaA, 'PATCH', `/${f.id}`, { ativo: false })
    expect(arq.corpo.ativo).toBe(false)
    const lista = (await chamar(m, m.dono, m.lojaA, 'GET', '')).corpo.itens as { id: string }[]
    expect(lista.find((x) => x.id === f.id)).toBeUndefined()
    const comInativos = (await chamar(m, m.dono, m.lojaA, 'GET', '?incluir_inativos=true')).corpo.itens as { id: string }[]
    expect(comInativos.find((x) => x.id === f.id)).toBeTruthy()
  })

  it('escalas: cria, lista ordenada, edita, desativa (some da lista); detalhe traz as ativas', async () => {
    const f = (await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Escalada', cargo_id: cozinheiraId })).corpo
    const e1 = await chamar(m, m.dono, m.lojaA, 'POST', `/${f.id}/escalas`, { dia_semana: 3, entrada: '08:00', saida: '12:00' })
    expect(e1.status).toBe(201)
    expect(e1.corpo).toMatchObject({ pessoa_id: f.id, dia_semana: 3, entrada: '08:00', saida: '12:00', ativo: true })
    await chamar(m, m.dono, m.lojaA, 'POST', `/${f.id}/escalas`, { dia_semana: 1, entrada: '18:00', saida: '23:00' })
    const lista = (await chamar(m, m.dono, m.lojaA, 'GET', `/${f.id}/escalas`)).corpo.itens as { dia_semana: number }[]
    expect(lista.map((x) => x.dia_semana)).toEqual([1, 3])
    const edit = await chamar(m, m.dono, m.lojaA, 'PATCH', `/escalas/${e1.corpo.id}`, { saida: '13:00' })
    expect(edit.corpo.saida).toBe('13:00')
    const des = await chamar(m, m.dono, m.lojaA, 'POST', `/escalas/${e1.corpo.id}/desativar`)
    expect(des.corpo.ativo).toBe(false)
    const det = await chamar(m, m.dono, m.lojaA, 'GET', `/${f.id}`)
    expect((det.corpo.escalas as { id: string }[]).map((x) => x.id)).not.toContain(e1.corpo.id)
  })

  it('entrada = saida na escala e recusado (400)', async () => {
    const f = (await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Igual', cargo_id: cozinheiraId })).corpo
    const r = await chamar(m, m.dono, m.lojaA, 'POST', `/${f.id}/escalas`, { dia_semana: 2, entrada: '08:00', saida: '08:00' })
    expect(r.status).toBe(400)
  })
})
