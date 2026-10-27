// SEC-001/002/024/030/081 de pessoas: isolamento por loja, loja_id do corpo ignorado, PII do
// telefone fora do log, sem DELETE (api) e sem grant (atendente), validacao estrita.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip

interface CargoItem { id: string; chave: string | null }

d('pessoas: seguranca', () => {
  let m: Mundo
  let cargoA = ''
  let pessoaA = ''

  beforeAll(async () => {
    m = await montarMundo()
    const cargos = (await chamar(m, m.dono, m.lojaA, 'GET', '/cargos')).corpo.itens as CargoItem[]
    cargoA = cargos.find((c) => c.chave === 'cozinheira')!.id
    pessoaA = (await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Secreta', cargo_id: cargoA, telefone: '11955554444' })).corpo.id
  })
  afterAll(async () => {
    await encerrar(m)
  })

  it('SEC-001: sem token 401; loja de outra conta no header 404 (nao vaza existencia)', async () => {
    const sem = await m.app.inject({ method: 'GET', url: '/v1/pessoas' })
    expect(sem.statusCode).toBe(401)
    const r = await chamar(m, m.donoB, m.lojaA, 'GET', '')
    expect(r.status).toBe(404)
  })

  it('SEC-001: pessoa da loja A nao aparece nem e mutavel pela loja B (404)', async () => {
    const listaB = (await chamar(m, m.donoB, m.lojaB, 'GET', '')).corpo.itens as { id: string }[]
    expect(listaB.find((x) => x.id === pessoaA)).toBeUndefined()
    const casos: [string, string, unknown][] = [
      ['GET', `/${pessoaA}`, undefined],
      ['PATCH', `/${pessoaA}`, { nome: 'hack' }],
      ['POST', `/${pessoaA}/telefone/revelar`, undefined],
      ['GET', `/${pessoaA}/escalas`, undefined],
      ['POST', `/${pessoaA}/escalas`, { dia_semana: 1, entrada: '08:00', saida: '12:00' }],
      ['PATCH', `/cargos/${cargoA}`, { nome: 'hack' }],
    ]
    for (const [metodo, url, corpo] of casos) {
      const r = await chamar(m, m.donoB, m.lojaB, metodo as 'GET', url, corpo)
      expect([404, 422], `${metodo} ${url}`).toContain(r.status)
    }
    const { rows } = await poolSuper.query<{ nome: string }>('select nome from public.pessoas where id = $1', [pessoaA])
    expect(rows[0]!.nome).toBe('Secreta')
  })

  it('SEC-002: loja_id no corpo e rejeitado (schema estrito) e nunca usado', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Z', cargo_id: cargoA, loja_id: m.lojaB })
    expect(r.status).toBe(400)
    expect(r.corpo.error.code).toBe('entrada_invalida')
  })

  it('atendente nao gere equipe (sem loja:gerir): 403', async () => {
    expect((await chamar(m, m.atendente, m.lojaA, 'GET', '')).status).toBe(403)
    expect((await chamar(m, m.atendente, m.lojaA, 'POST', `/${pessoaA}/telefone/revelar`)).status).toBe(403)
  })

  it('SEC-081: tipos, tamanhos e enums invalidos sao rejeitados no envelope', async () => {
    const casos: [string, string, unknown][] = [
      ['POST', '', { nome: '', cargo_id: cargoA }],
      ['POST', '', { nome: 'ok', cargo_id: 'nao-uuid' }],
      ['POST', '/cargos', { nome: 'a'.repeat(61) }],
      ['PATCH', `/${pessoaA}`, {}],
      ['POST', `/${pessoaA}/escalas`, { dia_semana: 7, entrada: '08:00', saida: '12:00' }],
      ['POST', `/${pessoaA}/escalas`, { dia_semana: 1, entrada: '25:00', saida: '12:00' }],
    ]
    for (const [metodo, url, corpo] of casos) {
      const r = await chamar(m, m.dono, m.lojaA, metodo as 'POST', url, corpo)
      expect(r.status, `${metodo} ${url}`).toBe(400)
      expect(r.corpo.error.code).toBe('entrada_invalida')
    }
  })

  it('SEC-024: telefone e nome nao aparecem em resposta de erro', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'POST', '', { nome: 'Fulano Segredo', cargo_id: cargoA, telefone: 'xxx' })
    expect(JSON.stringify(r.corpo)).not.toContain('xxx')
    expect(JSON.stringify(r.corpo)).not.toMatch(/violates|constraint|public\./)
  })

  it('SEC-030: whaviso_api nao tem DELETE em cargos/pessoas/escalas; atendente sem grant', async () => {
    const c = await poolSuper.connect()
    try {
      const deletes = ['delete from public.escalas', 'delete from public.pessoas', 'delete from public.cargos']
      for (const comando of deletes) {
        await c.query('begin')
        await c.query('set local role whaviso_api')
        await expect(c.query(comando)).rejects.toThrow(/permission denied|permiss.o negada/)
        await c.query('rollback')
      }
      await c.query('begin')
      await c.query('set local role whaviso_atendente')
      await expect(c.query('select 1 from public.pessoas')).rejects.toThrow(/permission denied|permiss.o negada/)
      await c.query('rollback')
    } finally {
      c.release()
    }
  })
})
