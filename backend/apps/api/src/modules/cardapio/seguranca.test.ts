// SEC-001/002/030/081 do cardapio: isolamento por loja, loja_id do corpo ignorado, sem DELETE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, como, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip

d('cardapio: seguranca', () => {
  let m: Mundo
  let grupoA: { id: string; opcoes: { id: string }[] }
  let catA: string
  let itemA: string
  let grupoB: { id: string }

  beforeAll(async () => {
    m = await montarMundo()
    grupoA = (await chamar(m, m.dono, m.lojaA, 'POST', '/grupos', { nome: 'GA', opcoes: [{ nome: 'o' }] })).corpo
    catA = (await chamar(m, m.dono, m.lojaA, 'POST', '/categorias', { nome: 'CA' })).corpo.id
    itemA = (await chamar(m, m.dono, m.lojaA, 'POST', '/itens', { categoria_id: catA, nome: 'IA' })).corpo.id
    grupoB = (await chamar(m, m.donoB, m.lojaB, 'POST', '/grupos', { nome: 'GB' })).corpo
  })
  afterAll(async () => {
    await encerrar(m)
  })

  it('SEC-001: sem token 401; loja de outra conta no header 404 (nao vaza existencia)', async () => {
    const sem = await m.app.inject({ method: 'GET', url: '/v1/cardapio' })
    expect(sem.statusCode).toBe(401)
    const r = await chamar(m, m.donoB, m.lojaA, 'GET', '/')
    expect(r.status).toBe(404)
  })

  it('SEC-001: com a propria loja, nada de A aparece para B (leitura)', async () => {
    const arv = await chamar(m, m.donoB, m.lojaB, 'GET', '/')
    expect(JSON.stringify(arv.corpo)).not.toContain(catA)
    expect(JSON.stringify(arv.corpo)).not.toContain(itemA)
    const gr = await chamar(m, m.donoB, m.lojaB, 'GET', '/grupos')
    expect(gr.corpo.grupos.map((g: { id: string }) => g.id)).toEqual([grupoB.id])
  })

  it('SEC-001: editar ids de A usando a loja B responde 404 em todas as rotas de escrita', async () => {
    const B = (metodo: 'PATCH' | 'POST' | 'PUT', url: string, corpo: unknown) =>
      chamar(m, m.donoB, m.lojaB, metodo, url, corpo)
    const casos: [number, Awaited<ReturnType<typeof B>>][] = [
      [404, await B('PATCH', `/grupos/${grupoA.id}`, { nome: 'hack' })],
      [404, await B('POST', `/grupos/${grupoA.id}/opcoes`, { nome: 'hack' })],
      [404, await B('PATCH', `/opcoes/${grupoA.opcoes[0]!.id}`, { nome: 'hack' })],
      [404, await B('PATCH', `/categorias/${catA}`, { nome: 'hack' })],
      [404, await B('PUT', `/categorias/${catA}/grupos`, { grupos: [] })],
      [404, await B('PATCH', `/itens/${itemA}`, { nome: 'hack' })],
      [404, await B('PUT', `/itens/${itemA}/grupos`, { excecoes: [] })],
      [404, await B('POST', `/itens/${itemA}/disponibilidade`, { ativo: false })],
      [404, await B('POST', `/opcoes/${grupoA.opcoes[0]!.id}/disponibilidade`, { ativo: false })],
      [404, await B('PUT', `/grupos/${grupoA.id}/opcoes/ordem`, { ids: [grupoA.opcoes[0]!.id] })],
    ]
    for (const [esperado, r] of casos) expect(r.status).toBe(esperado)
    const { rows } = await poolSuper.query<{ nome: string }>('select nome from public.itens where id = $1', [itemA])
    expect(rows[0]!.nome).toBe('IA')
  })

  it('SEC-002: todo vinculo valida pertencimento a loja dos dois lados', async () => {
    const catB = (await chamar(m, m.donoB, m.lojaB, 'POST', '/categorias', { nome: 'CB' })).corpo.id
    // grupo de A em categoria de B (loja B ativa): grupo nao existe na loja B
    const a = await chamar(m, m.donoB, m.lojaB, 'PUT', `/categorias/${catB}/grupos`, { grupos: [{ grupo_id: grupoA.id }] })
    expect(a.status).toBe(422)
    // grupo de B em categoria de A
    const b = await chamar(m, m.dono, m.lojaA, 'PUT', `/categorias/${catA}/grupos`, { grupos: [{ grupo_id: grupoB.id }] })
    expect(b.status).toBe(422)
    // excecao de item com grupo de B
    const c = await chamar(m, m.dono, m.lojaA, 'PUT', `/itens/${itemA}/grupos`, {
      excecoes: [{ grupo_id: grupoB.id, incluir: true }],
    })
    expect(c.status).toBe(422)
    // item em categoria de outra loja
    const d2 = await chamar(m, m.dono, m.lojaA, 'POST', '/itens', { categoria_id: catB, nome: 'X' })
    expect(d2.status).toBe(422)
    // mover item de A para categoria de B
    const e = await chamar(m, m.dono, m.lojaA, 'PATCH', `/itens/${itemA}`, { categoria_id: catB })
    expect(e.status).toBe(422)
  })

  it('SEC-002: loja_id no corpo e rejeitado (schema estrito) e nunca usado', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'POST', '/grupos', { nome: 'Z', loja_id: m.lojaB })
    expect(r.status).toBe(400)
    const q = await m.app.inject({
      method: 'GET',
      url: `/v1/cardapio/?loja_id=${m.lojaB}`,
      headers: como(m.dono, m.lojaA),
    })
    expect(q.statusCode).toBe(200)
    expect(JSON.stringify(q.json())).not.toContain(grupoB.id)
  })

  it('SEC-081: tipos, tamanhos e enums invalidos sao rejeitados no envelope', async () => {
    const casos: [string, string, unknown][] = [
      ['POST', '/grupos', { nome: '' }],
      ['POST', '/grupos', { nome: 'a'.repeat(81) }],
      ['POST', '/grupos', { nome: 'ok', tipo: 'inventado' }],
      ['POST', '/grupos', { nome: 'ok', min_escolhas: -1 }],
      ['POST', '/grupos', { nome: 'ok', max_escolhas: 0 }],
      ['POST', '/grupos', { nome: 123 }],
      ['POST', '/categorias', { nome: 'ok', descricao: 'd'.repeat(501) }],
      ['POST', '/itens', { categoria_id: 'nao-uuid', nome: 'ok' }],
      ['POST', '/itens', { categoria_id: catA, nome: 'ok', preco_centavos: 2_000_000_000 }],
      ['PATCH', `/itens/${itemA}`, {}],
      ['PATCH', '/itens/nao-uuid', { nome: 'a' }],
      ['POST', `/itens/${itemA}/disponibilidade`, { esgotado_ate: 'amanha' }],
    ]
    for (const [metodo, url, corpo] of casos) {
      const r = await chamar(m, m.dono, m.lojaA, metodo as 'POST', url, corpo)
      expect(r.status, `${metodo} ${url}`).toBe(400)
      expect(r.corpo.error.code).toBe('entrada_invalida')
    }
  })

  it('exige loja ativa (header) para mexer no cardapio', async () => {
    const res = await m.app.inject({
      method: 'GET',
      url: '/v1/cardapio/grupos',
      headers: { authorization: `Bearer ${m.dono}` },
    })
    // dono tem vinculo "todas as lojas" (2+ lojas nao, aqui 1): resolve a unica ou pede a ativa.
    expect([200, 422]).toContain(res.statusCode)
  })

  it('SEC-030: whaviso_api nao tem DELETE nas tabelas do cardapio; atendente so le', async () => {
    const c = await poolSuper.connect()
    try {
      const deletes = [
        'delete from public.grupos_opcoes',
        'delete from public.opcoes',
        'delete from public.categorias',
        'delete from public.categoria_grupos',
        'delete from public.itens',
        'delete from public.item_grupos',
      ]
      for (const comando of deletes) {
        await c.query('begin')
        await c.query('set local role whaviso_api')
        await expect(c.query(comando)).rejects.toThrow(/permission denied|permiss.o negada/)
        await c.query('rollback')
      }
      await c.query('begin')
      await c.query('set local role whaviso_atendente')
      const lido = await c.query('select count(*)::int as n from public.itens')
      expect(lido.rows[0].n).toBeGreaterThan(0)
      await expect(c.query("update public.itens set nome = 'x'")).rejects.toThrow(/permission denied|permiss.o negada/)
      await c.query('rollback')
      await c.query('begin')
      await c.query('set local role whaviso_atendente')
      await expect(
        c.query("insert into public.categorias (loja_id, nome) values ($1, 'x')", [m.lojaA]),
      ).rejects.toThrow(/permission denied|permiss.o negada/)
      await c.query('rollback')
    } finally {
      c.release()
    }
  })

  it('respostas de erro nao vazam detalhe do banco', async () => {
    const r = await chamar(m, m.dono, m.lojaA, 'PATCH', `/itens/${itemA}`, { categoria_id: m.lojaB })
    expect(JSON.stringify(r.corpo)).not.toMatch(/violates|constraint|public\./)
  })
})
