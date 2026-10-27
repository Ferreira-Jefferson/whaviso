// Integracao do cadastro de motoboy (pessoa de cargo motoboy + veiculo/placa/Pix) e do Pix revelado.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chamar, encerrar, logs, montarMundo, online, PIX_CPF, TELEFONE_CLARO, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[motoboys] banco inacessivel: integracao PULADA.')

d('modulo motoboys (cadastro)', () => {
  let m: Mundo
  beforeAll(async () => { m = await montarMundo() })
  afterAll(async () => { if (m) await encerrar(m) })

  const comoDono = (metodo: 'GET' | 'POST' | 'PATCH', url: string, corpo?: unknown) =>
    chamar(m, m.dono, m.A.loja, metodo, url, corpo)

  let motoboyId = ''

  it('cria motoboy a partir da pessoa de cargo motoboy; saida so com mascaras', async () => {
    const r = await comoDono('POST', '/', {
      pessoa_id: m.A.pessoaMotoboy, veiculo: 'moto', placa: 'abc-1d23', pix_tipo: 'cpf', pix: '529.982.247-25',
    })
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    motoboyId = r.corpo.id
    expect(r.corpo).toMatchObject({
      pessoa_id: m.A.pessoaMotoboy, nome: 'Joao Entregador', veiculo: 'moto', placa: 'ABC1D23',
      pix_tipo: 'cpf', pix_ultimos4: '4725', telefone_ultimos4: TELEFONE_CLARO.slice(-4), ativo: true,
    })
    expect(r.body).not.toContain(PIX_CPF)
    expect(r.body).not.toContain(TELEFONE_CLARO)
    expect(r.body).not.toMatch(/pix_hash|pix_cifrado|telefone_hash|telefone_cifrado/)
  })

  it('banco guarda o Pix so como hash + cifra (nunca o claro)', async () => {
    const { poolSuper } = await import('../../../test/db')
    const { rows } = await poolSuper.query(
      'select pix_hash, pix_cifrado, placa from public.motoboys where id = $1', [motoboyId],
    )
    expect(rows[0].pix_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(Buffer.from(rows[0].pix_cifrado).includes(Buffer.from(PIX_CPF))).toBe(false)
  })

  it('pessoa que nao e motoboy: 422 pessoa_nao_motoboy; ja cadastrada: 409', async () => {
    const outra = await comoDono('POST', '/', { pessoa_id: m.A.pessoaOutra })
    expect(outra.status).toBe(422)
    expect(outra.corpo.error.code).toBe('pessoa_nao_motoboy')
    const dup = await comoDono('POST', '/', { pessoa_id: m.A.pessoaMotoboy })
    expect(dup.status).toBe(409)
    expect(dup.corpo.error.code).toBe('motoboy_ja_cadastrado')
  })

  it('pessoa de outra loja: 404 (nao confirma existencia)', async () => {
    const r = await comoDono('POST', '/', { pessoa_id: m.B.pessoaMotoboy })
    expect(r.status).toBe(404)
  })

  it('placa e Pix invalidos: 422; Pix sem tipo: 400', async () => {
    const pb = await comoDono('PATCH', `/${motoboyId}`, { placa: 'XX999' })
    expect(pb.status).toBe(422)
    expect(pb.corpo.error.code).toBe('placa_invalida')
    const px = await comoDono('PATCH', `/${motoboyId}`, { pix_tipo: 'cpf', pix: '123' })
    expect(px.status).toBe(422)
    expect(px.corpo.error.code).toBe('pix_invalido')
    const meio = await comoDono('PATCH', `/${motoboyId}`, { pix: '123' })
    expect(meio.status).toBe(400)
  })

  it('PATCH parcial: troca veiculo e limpa a placa sem tocar no Pix', async () => {
    const r = await comoDono('PATCH', `/${motoboyId}`, { veiculo: 'bicicleta', placa: null })
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(r.corpo).toMatchObject({ veiculo: 'bicicleta', placa: null, pix_ultimos4: '4725' })
  })

  it('corpo com chave extra e rejeitado (strict): 400', async () => {
    const r = await comoDono('PATCH', `/${motoboyId}`, { veiculo: 'moto', loja_id: m.B.loja })
    expect(r.status).toBe(400)
  })

  it('desativar/ativar com guarda de estado; seletor leve esconde inativo por padrao', async () => {
    const off = await comoDono('POST', `/${motoboyId}/desativar`)
    expect(off.status).toBe(200)
    expect(off.corpo.ativo).toBe(false)
    expect((await comoDono('POST', `/${motoboyId}/desativar`)).status).toBe(409)
    const sel = await chamar(m, m.atendente, m.A.loja, 'GET', '/seletor')
    expect(sel.status).toBe(200)
    expect(sel.corpo.itens).toEqual([])
    const on = await comoDono('POST', `/${motoboyId}/ativar`)
    expect(on.corpo.ativo).toBe(true)
    const sel2 = await chamar(m, m.atendente, m.A.loja, 'GET', '/seletor')
    expect(Object.keys(sel2.corpo.itens[0]).sort()).toEqual(['ativo', 'id', 'nome', 'veiculo'])
  })

  it('papeis: atendente nao lista/cadastra (403); gerente lista', async () => {
    expect((await chamar(m, m.atendente, m.A.loja, 'GET', '/')).status).toBe(403)
    expect((await chamar(m, m.atendente, m.A.loja, 'POST', '/', { pessoa_id: m.A.pessoaMotoboy })).status).toBe(403)
    const g = await chamar(m, m.gerente, m.A.loja, 'GET', '/')
    expect(g.status).toBe(200)
    expect(g.corpo.itens).toHaveLength(1)
  })

  it('isolamento: dono da loja B nao ve nem altera o motoboy da loja A (404)', async () => {
    expect((await chamar(m, m.donoB, m.B.loja, 'GET', `/${motoboyId}`)).status).toBe(404)
    expect((await chamar(m, m.donoB, m.B.loja, 'PATCH', `/${motoboyId}`, { veiculo: 'carro' })).status).toBe(404)
    expect((await chamar(m, m.donoB, m.A.loja, 'GET', '/')).status).toBe(404) // loja alheia no header
  })

  it('revelar Pix: dono/gerente veem o claro, sem cache; atendente 403; sem Pix 422', async () => {
    const r = await comoDono('POST', `/${motoboyId}/pix/revelar`)
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ pix_tipo: 'cpf', pix: PIX_CPF })
    expect(String(r.headers['cache-control'])).toContain('no-store')
    expect((await chamar(m, m.gerente, m.A.loja, 'POST', `/${motoboyId}/pix/revelar`)).status).toBe(200)
    expect((await chamar(m, m.atendente, m.A.loja, 'POST', `/${motoboyId}/pix/revelar`)).status).toBe(403)
    const limpa = await comoDono('PATCH', `/${motoboyId}`, { pix_tipo: null, pix: null })
    expect(limpa.corpo.pix_tipo).toBeNull()
    const sem = await comoDono('POST', `/${motoboyId}/pix/revelar`)
    expect(sem.status).toBe(422)
    expect(sem.corpo.error.code).toBe('pix_nao_cadastrado')
  })

  it('auditoria do Pix revelado nao carrega o valor; logs nao vazam Pix nem telefone', async () => {
    const { poolSuper } = await import('../../../test/db')
    const { rows } = await poolSuper.query(
      "select detalhes::text as d from public.eventos where loja_id = $1 and tipo like 'motoboy.%'", [m.A.loja],
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.d).not.toContain(PIX_CPF)
      expect(r.d).not.toContain(TELEFONE_CLARO)
    }
    const log = logs.join('')
    expect(log).not.toContain(PIX_CPF)
    expect(log).not.toContain(TELEFONE_CLARO)
    expect(log).not.toContain('529.982.247-25')
  })
})
