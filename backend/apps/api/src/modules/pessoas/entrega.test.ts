// Dados de entrega no cadastro da pessoa (cargo motoboy): veiculo, placa, Pix e regime de pagamento,
// gravados na tabela `motoboys` (1:1 com a pessoa) pelo PROPRIO modulo pessoas. Espelha a protecao
// do Pix do modulo motoboys: saida so com mascara (ultimos 4); o banco guarda hash + cifra; o claro
// so sai em `entrega/pix/revelar` (dono/gerente, no-store), auditado SEM o valor.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip
if (!online) console.warn('[pessoas] banco inacessivel: integracao de entrega PULADA.')

const PIX_CPF = '529.982.247-25'
const PIX_CPF_NORM = '52998224725'

interface CargoItem { id: string; chave: string | null }

d('pessoas: dados de entrega', () => {
  let m: Mundo
  let motoboyId = ''
  let cozinheiraId = ''
  let pessoaMoto = ''
  let pessoaCozinha = ''

  beforeAll(async () => {
    m = await montarMundo()
    const cargos = (await chamar(m, m.dono, m.lojaA, 'GET', '/cargos')).corpo.itens as CargoItem[]
    motoboyId = cargos.find((c) => c.chave === 'motoboy')!.id
    cozinheiraId = cargos.find((c) => c.chave === 'cozinheira')!.id
    pessoaMoto = (await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Ze Entregador', cargo_id: motoboyId, telefone: '11988887777' })).corpo.id
    pessoaCozinha = (await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Dona Rita', cargo_id: cozinheiraId })).corpo.id
  })
  afterAll(async () => {
    await encerrar(m)
  })

  it('define entrega a partir da pessoa de cargo motoboy; saida so com mascara do Pix', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'PUT', `/${pessoaMoto}/entrega`, {
      veiculo: 'moto', placa: 'abc-1d23', pix_tipo: 'cpf', pix: PIX_CPF, regime_pagamento: 'por_entrega',
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(r.corpo).toEqual({
      veiculo: 'moto', placa: 'ABC1D23', pix_tipo: 'cpf', pix_ultimos4: '4725',
      regime_pagamento: 'por_entrega', periodicidade_fixo: 'dia', valor_fixo_centavos: 0,
    })
    expect(r.body).not.toContain(PIX_CPF)
    expect(r.body).not.toContain(PIX_CPF_NORM)
    expect(r.body).not.toMatch(/pix_hash|pix_cifrado/)
    // E vem no detalhe da pessoa.
    const det = await chamar(m, m.dono, m.lojaA, 'GET', `/${pessoaMoto}`)
    expect(det.corpo.entrega).toMatchObject({ veiculo: 'moto', pix_ultimos4: '4725' })
  })

  it('banco guarda o Pix so como hash (64 hex) + cifra, nunca o claro', async () => {
    const { rows } = await poolSuper.query<{ pix_hash: string; pix_cifrado: Buffer }>(
      'select pix_hash, pix_cifrado from public.motoboys where loja_id = $1 and pessoa_id = $2',
      [m.lojaA, pessoaMoto],
    )
    expect(rows[0]!.pix_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(Buffer.from(rows[0]!.pix_cifrado).includes(Buffer.from(PIX_CPF_NORM))).toBe(false)
  })

  it('detalhe de pessoa sem entrega traz entrega: null', async () => {
    const det = await chamar(m, m.dono, m.lojaA, 'GET', `/${pessoaCozinha}`)
    expect(det.corpo.entrega).toBeNull()
  })

  it('cargo nao-motoboy: 422 cargo_nao_motoboy', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'PUT', `/${pessoaCozinha}/entrega`, {
      veiculo: 'moto', regime_pagamento: 'por_entrega',
    })
    expect(r.status).toBe(422)
    expect(r.corpo.error.code).toBe('cargo_nao_motoboy')
  })

  it('placa e Pix invalidos: 422; Pix sem tipo: 400', async () => {
    const pb = await chamar(m, m.dono, m.lojaA, 'PUT', `/${pessoaMoto}/entrega`, {
      veiculo: 'moto', placa: 'XX999', regime_pagamento: 'por_entrega',
    })
    expect(pb.status).toBe(422)
    expect(pb.corpo.error.code).toBe('placa_invalida')
    const px = await chamar(m, m.dono, m.lojaA, 'PUT', `/${pessoaMoto}/entrega`, {
      veiculo: 'moto', pix_tipo: 'cpf', pix: '123', regime_pagamento: 'por_entrega',
    })
    expect(px.status).toBe(422)
    expect(px.corpo.error.code).toBe('pix_invalido')
    const meio = await chamar(m, m.dono, m.lojaA, 'PUT', `/${pessoaMoto}/entrega`, {
      veiculo: 'moto', pix: '123', regime_pagamento: 'por_entrega',
    })
    expect(meio.status).toBe(400)
  })

  it('coerencia do regime: fixo sem valor_fixo 422; por_entrega com valor 0 ok', async () => {
    const semValor = await chamar(m, m.dono, m.lojaA, 'PUT', `/${pessoaMoto}/entrega`, {
      veiculo: 'moto', regime_pagamento: 'fixo', periodicidade_fixo: 'dia', valor_fixo_centavos: 0,
    })
    expect(semValor.status).toBe(422)
    expect(semValor.corpo.error.code).toBe('valor_fixo_obrigatorio')
    const porEntrega = await chamar(m, m.dono, m.lojaA, 'PUT', `/${pessoaMoto}/entrega`, {
      veiculo: 'moto', regime_pagamento: 'por_entrega', valor_fixo_centavos: 0,
    })
    expect(porEntrega.status).toBe(200)
    expect(porEntrega.corpo.valor_fixo_centavos).toBe(0)
  })

  it('update troca veiculo/placa/regime SEM reenviar o Pix e o Pix e mantido', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'PUT', `/${pessoaMoto}/entrega`, {
      veiculo: 'bicicleta', placa: 'bra-2e19',
      regime_pagamento: 'fixo_mais_entrega', periodicidade_fixo: 'mes', valor_fixo_centavos: 150000,
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(r.corpo).toMatchObject({
      veiculo: 'bicicleta', placa: 'BRA2E19', regime_pagamento: 'fixo_mais_entrega',
      periodicidade_fixo: 'mes', valor_fixo_centavos: 150000, pix_ultimos4: '4725',
    })
    expect(r.body).not.toContain(PIX_CPF)
    // Uma unica linha por pessoa (upsert nao duplica).
    const { rows } = await poolSuper.query<{ n: string }>(
      'select count(*) as n from public.motoboys where loja_id = $1 and pessoa_id = $2', [m.lojaA, pessoaMoto],
    )
    expect(rows[0]!.n).toBe('1')
  })

  it('revelar Pix: dono/gerente veem o claro, sem cache; atendente 403; sem Pix 422', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'POST', `/${pessoaMoto}/entrega/pix/revelar`)
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ pix_tipo: 'cpf', pix: PIX_CPF_NORM })
    expect(String(r.headers['cache-control'])).toContain('no-store')
    expect((await chamar(m, m.gerente, m.lojaA, 'POST', `/${pessoaMoto}/entrega/pix/revelar`)).status).toBe(200)
    expect((await chamar(m, m.atendente, m.lojaA, 'POST', `/${pessoaMoto}/entrega/pix/revelar`)).status).toBe(403)
    // Pessoa sem entrega (cozinheira) nao tem Pix: 422.
    const sem = await chamar(m, m.dono, m.lojaA, 'POST', `/${pessoaCozinha}/entrega/pix/revelar`)
    expect(sem.status).toBe(422)
    expect(sem.corpo.error.code).toBe('pix_nao_cadastrado')
  })

  it('auditoria do Pix revelado e do upsert nao carregam o valor do Pix', async () => {
    const { rows } = await poolSuper.query<{ d: string }>(
      "select detalhes::text as d from public.eventos where loja_id = $1 and tipo like 'pessoa.%'", [m.lojaA],
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.d).not.toContain(PIX_CPF)
      expect(row.d).not.toContain(PIX_CPF_NORM)
    }
  })

  it('isolamento: loja B nao define nem revela a entrega da pessoa da loja A (404)', async () => {
    expect((await chamar(m, m.donoB, m.lojaB, 'PUT', `/${pessoaMoto}/entrega`, {
      veiculo: 'carro', regime_pagamento: 'por_entrega',
    })).status).toBe(404)
    expect((await chamar(m, m.donoB, m.lojaB, 'POST', `/${pessoaMoto}/entrega/pix/revelar`)).status).toBe(404)
  })
})
