// Integracao (Postgres LOCAL whaviso_dev_conversas): leitura, isolamento multi-tenant, papeis, grants e logs.
import { describe, it, expect } from 'vitest'
import { bancoAcessivel, poolSuper, criarUsuario, criarOperador, novoCenario, limpar } from '../../../test/db'
import { criarLogger } from '@whaviso/shared/logger'
import { criarHarness, bearer, horas } from './tests/harness'
import { criarMundo, criarCliente, criarConversa, criarMensagem, criarPedido } from './tests/fixtures'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[conversas] banco inacessivel: testes de integracao PULADOS.')

d('conversas: leitura, isolamento e seguranca', () => {
  const h = criarHarness()
  it('lista: previa, nao lidas, janela, cliente sem telefone, filtros e paginacao', async () => {
    const m = await h.novo()
    const agora = Date.now()
    const ana = await criarCliente(m.lojaId, 'Ana Souza')
    const sem = await criarCliente(m.lojaId, null)
    const c1 = await criarConversa(m, ana.id, { status: 'humano', ultimaEntrada: new Date(agora - horas(2)) })
    const c2 = await criarConversa(m, sem.id, { status: 'ia', ultimaEntrada: new Date(agora - horas(30)) })
    await criarMensagem(m.lojaId, c1, 'saida', 'resposta antiga', new Date(agora - horas(3)))
    await criarMensagem(m.lojaId, c1, 'entrada', 'quero uma pizza ' + 'x'.repeat(200), new Date(agora - horas(2)))
    await criarMensagem(m.lojaId, c1, 'entrada', 'e uma coca', new Date(agora - horas(1)))
    await h.montar()

    const r = await h.app.inject({ method: 'GET', url: '/v1/conversas', headers: bearer(m.userId) })
    expect(r.statusCode).toBe(200)
    const corpo = r.json()
    expect(corpo.itens).toHaveLength(2)
    const i1 = corpo.itens.find((i: { id: string }) => i.id === c1)
    const i2 = corpo.itens.find((i: { id: string }) => i.id === c2)
    expect(i1.nao_lidas).toBe(2)
    expect(i1.ultima_mensagem.previa).toBe('e uma coca')
    expect(i1.janela_aberta).toBe(true)
    expect(i1.janela_restante_segundos).toBeGreaterThan(21 * 3600)
    expect(i1.cliente.nome).toBe('Ana Souza')
    expect(i2.janela_aberta).toBe(false)
    expect(i2.janela_restante_segundos).toBe(0)
    expect(i2.cliente.nome).toBeNull()
    expect(i2.cliente.rotulo).toMatch(/^Cliente [0-9a-f]{4}$/)
    expect(i2.ultima_mensagem).toBeNull()
    // sem telefone nem hash completo em nenhum lugar
    expect(r.body).not.toContain(sem.hash)
    expect(r.body).not.toContain('telefone')

    const so = await h.app.inject({ method: 'GET', url: '/v1/conversas?status=ia', headers: bearer(m.userId) })
    expect(so.json().itens.map((i: { id: string }) => i.id)).toEqual([c2])
    const busca = await h.app.inject({ method: 'GET', url: '/v1/conversas?busca=ana', headers: bearer(m.userId) })
    expect(busca.json().itens.map((i: { id: string }) => i.id)).toEqual([c1])
    const curinga = await h.app.inject({ method: 'GET', url: '/v1/conversas?busca=%25', headers: bearer(m.userId) })
    expect(curinga.json().itens).toHaveLength(0)

    const p1 = (await h.app.inject({ method: 'GET', url: '/v1/conversas?limite=1', headers: bearer(m.userId) })).json()
    expect(p1.itens).toHaveLength(1)
    expect(p1.proximo_cursor).toBeTruthy()
    const p2 = (
      await h.app.inject({ method: 'GET', url: `/v1/conversas?limite=1&cursor=${p1.proximo_cursor}`, headers: bearer(m.userId) })
    ).json()
    expect(p2.itens).toHaveLength(1)
    expect(p2.itens[0].id).not.toBe(p1.itens[0].id)
    expect(p2.proximo_cursor).toBeNull()
    const ruim = await h.app.inject({ method: 'GET', url: '/v1/conversas?cursor=lixo', headers: bearer(m.userId) })
    expect(ruim.statusCode).toBe(422)
    expect(ruim.json().error.code).toBe('cursor_invalido')
  })

  it('abrir: detalhe com janela, pedido ligado e numero; 404 para id inexistente', async () => {
    const m = await h.novo()
    const cli = await criarCliente(m.lojaId, 'Bia')
    const c = await criarConversa(m, cli.id, { ultimaEntrada: new Date(Date.now() - horas(1)) })
    const pedido = await criarPedido(m, c, cli.id)
    await h.montar()
    const r = await h.app.inject({ method: 'GET', url: `/v1/conversas/${c}`, headers: bearer(m.userId) })
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.janela_aberta).toBe(true)
    expect(j.pedido_ligado.id).toBe(pedido)
    expect(j.numero_whatsapp).toEqual({ id: m.numeroId, status: 'conectado' })
    const nao = await h.app.inject({
      method: 'GET',
      url: '/v1/conversas/11111111-1111-4111-8111-111111111111',
      headers: bearer(m.userId),
    })
    expect(nao.statusCode).toBe(404)
    expect(nao.json().error.code).toBe('conversa_nao_encontrada')
    const mal = await h.app.inject({ method: 'GET', url: '/v1/conversas/abc', headers: bearer(m.userId) })
    expect(mal.statusCode).toBe(400)
  })

  it('mensagens: historico para tras, cronologico, estavel com mensagem nova; midia so referencia', async () => {
    const m = await h.novo()
    const cli = await criarCliente(m.lojaId, 'Caio')
    const c = await criarConversa(m, cli.id)
    const base = Date.now() - horas(5)
    for (let i = 0; i < 5; i++) await criarMensagem(m.lojaId, c, 'entrada', `msg ${i}`, new Date(base + i * 1000))
    await poolSuper.query(`update public.mensagens set tipo='imagem', midia_ref='media/abc', conteudo=null where conversa_id=$1 and criado_em=$2`, [
      c,
      new Date(base + 4000),
    ])
    await h.montar()
    const url = `/v1/conversas/${c}/mensagens`
    const a = (await h.app.inject({ method: 'GET', url: `${url}?limite=2`, headers: bearer(m.userId) })).json()
    expect(a.itens.map((x: { conteudo: string | null }) => x.conteudo)).toEqual(['msg 3', null])
    expect(a.itens[1].midia_ref).toBe('media/abc')
    expect(a.itens[1]).not.toHaveProperty('wamid')
    // chega mensagem nova entre as paginas: a pagina anterior nao muda nem duplica
    await criarMensagem(m.lojaId, c, 'entrada', 'msg nova', new Date())
    const b = (await h.app.inject({ method: 'GET', url: `${url}?limite=2&cursor=${a.proximo_cursor}`, headers: bearer(m.userId) })).json()
    expect(b.itens.map((x: { conteudo: string }) => x.conteudo)).toEqual(['msg 1', 'msg 2'])
    const c3 = (await h.app.inject({ method: 'GET', url: `${url}?limite=2&cursor=${b.proximo_cursor}`, headers: bearer(m.userId) })).json()
    expect(c3.itens.map((x: { conteudo: string }) => x.conteudo)).toEqual(['msg 0'])
    expect(c3.proximo_cursor).toBeNull()
  })

  it('SEC-001/002: loja A nao le nem escreve em conversa da loja B; x-loja-id alheio = 404', async () => {
    const a = await h.novo()
    const cenarioA = h.cenario
    const b = await criarMundo((h.cenario = novoCenario()), 'dono')
    const cb = await criarConversa(b, (await criarCliente(b.lojaId, 'Segredo B')).id, { ultimaEntrada: new Date() })
    await criarMensagem(b.lojaId, cb, 'entrada', 'conteudo da B', new Date())
    await h.montar()
    const hA = bearer(a.userId, a.lojaId)
    const lista = await h.app.inject({ method: 'GET', url: '/v1/conversas', headers: hA })
    expect(lista.json().itens).toHaveLength(0)
    for (const [metodo, url] of [
      ['GET', `/v1/conversas/${cb}`],
      ['GET', `/v1/conversas/${cb}/mensagens`],
      ['POST', `/v1/conversas/${cb}/lida`],
      ['POST', `/v1/conversas/${cb}/encerrar`],
    ] as const) {
      const r = await h.app.inject({ method: metodo, url, headers: hA })
      expect(r.statusCode, `${metodo} ${url}`).toBe(404)
      expect(r.body).not.toContain('Segredo B')
    }
    const resp = await h.app.inject({ method: 'POST', url: `/v1/conversas/${cb}/mensagens`, headers: hA, payload: { texto: 'invasao' } })
    expect(resp.statusCode).toBe(404)
    const forjado = await h.app.inject({ method: 'GET', url: '/v1/conversas', headers: bearer(a.userId, b.lojaId) })
    expect(forjado.statusCode).toBe(404)
    const { rows } = await poolSuper.query('select 1 from public.envios where loja_id=$1', [b.lojaId])
    expect(rows).toHaveLength(0)
    await limpar(cenarioA)
  })

  it('papeis: dono, gerente e atendente respondem; sem membership e operador da plataforma sao negados', async () => {
    for (const papel of ['dono', 'gerente', 'atendente'] as const) {
      const m = await h.novo(papel)
      const c = await criarConversa(m, (await criarCliente(m.lojaId, 'P')).id, { ultimaEntrada: new Date() })
      await h.montar()
      const r = await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/mensagens`, headers: bearer(m.userId), payload: { texto: 'oi' } })
      expect(r.statusCode, papel).toBe(201)
      await h.app.close()
      await limpar(h.cenario)
    }
    const m = await h.novo()
    const estranho = await criarUsuario(h.cenario)
    const op = await criarUsuario(h.cenario)
    await criarOperador(op)
    await h.montar()
    const sem = await h.app.inject({ method: 'GET', url: '/v1/conversas', headers: bearer(estranho) })
    expect(sem.statusCode).toBe(403)
    const oper = await h.app.inject({ method: 'GET', url: '/v1/conversas', headers: bearer(op) }) // SEC-003
    expect(oper.statusCode).toBe(403)
    const anon = await h.app.inject({ method: 'GET', url: '/v1/conversas' })
    expect(anon.statusCode).toBe(401)
    expect(anon.json().error.code).toBe('nao_autorizado')
    void m
  })

  it('varias lojas: exige x-loja-id; com header resolve a loja', async () => {
    const m = await h.novo()
    const outraLoja = (await poolSuper.query<{ id: string }>(`insert into public.lojas (conta_id, nome, ativo) values ($1,'Outra',true) returning id`, [m.contaId])).rows[0]!.id
    await poolSuper.query('update public.membros set loja_id = null where user_id=$1', [m.userId])
    await h.montar()
    const sem = await h.app.inject({ method: 'GET', url: '/v1/conversas', headers: bearer(m.userId) })
    expect(sem.statusCode).toBe(400)
    expect(sem.json().error.code).toBe('loja_ativa_obrigatoria')
    const com = await h.app.inject({ method: 'GET', url: '/v1/conversas', headers: bearer(m.userId, outraLoja) })
    expect(com.statusCode).toBe(200)
  })

  it('SEC-033: api nao pode UPDATE/DELETE em mensagens (grant so select/insert)', async () => {
    const m = await h.novo()
    const c = await criarConversa(m, (await criarCliente(m.lojaId, 'Q')).id)
    const id = await criarMensagem(m.lojaId, c, 'entrada', 'imutavel', new Date())
    const cli = await poolSuper.connect()
    try {
      await cli.query('set role whaviso_api')
      await expect(cli.query(`update public.mensagens set conteudo='x' where id=$1`, [id])).rejects.toThrow(/permission denied|permiss/)
      await expect(cli.query('delete from public.mensagens where id=$1', [id])).rejects.toThrow(/permission denied|permiss/)
    } finally {
      await cli.query('reset role').catch(() => {})
      cli.release()
    }
  })

  it('SEC-024: texto e identificadores sensiveis nunca aparecem no log', async () => {
    const m = await h.novo()
    const cli = await criarCliente(m.lojaId, 'Nome Sigiloso')
    const c = await criarConversa(m, cli.id, { ultimaEntrada: new Date() })
    const buf: string[] = []
    await h.montar({ logger: criarLogger('teste', 'trace', { write: (s: string) => buf.push(s) }) })
    await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/mensagens`, headers: bearer(m.userId), payload: { texto: 'texto-ultra-secreto' } })
    await h.app.inject({ method: 'GET', url: `/v1/conversas/${c}`, headers: bearer(m.userId) })
    await h.app.inject({ method: 'GET', url: `/v1/conversas/${c}/mensagens`, headers: bearer(m.userId) })
    const saida = buf.join('')
    expect(saida.length).toBeGreaterThan(0)
    expect(saida).not.toContain('texto-ultra-secreto')
    expect(saida).not.toContain('Nome Sigiloso')
    expect(saida).not.toContain(cli.hash)
  })
})
