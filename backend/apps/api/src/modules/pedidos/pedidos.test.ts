// Integracao do modulo pedidos contra o Postgres local (role whaviso_api).
// Cobre criacao manual com snapshot, kanban, transicoes, corrida, cancelamento de linha,
// impressao, realtime e seguranca (SEC-001/002/003/024/030/080/081).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolApi, poolSuper } from '../../../test/db'
import {
  LOGRADOURO, NOME_CLIENTE, TELEFONE, chamar, corpoPadrao, encerrar, montarMundo, online, type Mundo,
} from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[pedidos] banco inacessivel: integracao PULADA.')

d('modulo pedidos (integracao)', () => {
  let m: Mundo
  beforeAll(async () => { m = await montarMundo() })
  afterAll(async () => { if (m) await encerrar(m) })

  const criar = async (extra: Record<string, unknown> = {}) => {
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, extra))
    expect(r.status, JSON.stringify(r.corpo)).toBe(201)
    return r.corpo as { id: string; codigo: string; itens: { id: string }[] }
  }
  const mover = (id: string, para: string, motivo?: string, user = m.dono, loja = m.A.loja) =>
    chamar(m, user, loja, 'POST', `/${id}/status`, motivo ? { para, motivo } : { para })

  describe('criacao manual', () => {
    it('cria pedido novo com snapshot, totais em centavos e codigo AAMMDD-NNN', async () => {
      const p = await criar()
      const r = await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}`)
      expect(r.status).toBe(200)
      const c = r.corpo
      expect(c.status).toBe('novo')
      expect(c.origem).toBe('manual')
      expect(c.codigo).toMatch(/^\d{6}-\d{3}$/)
      // (2000 + 500 grande + 300 bacon) x 2 = 5600; taxa 500
      expect(c.subtotal_centavos).toBe(5600)
      expect(c.total_centavos).toBe(5600 + 500)
      expect(c.itens[0].nome_snapshot).toBe('Burger')
      expect(c.itens[0].preco_unitario_centavos).toBe(2000)
      expect(c.itens[0].opcoes.map((o: { nome_snapshot: string }) => o.nome_snapshot).sort()).toEqual(['Bacon', 'Grande'])
      expect(c.cliente.telefone_mascarado).toMatch(/1234$/)
      expect(JSON.stringify(c)).not.toContain(TELEFONE)
      expect(c.destinos).toEqual(['em_preparo', 'problema'])
    })

    it('codigos do dia sao sequenciais e unicos', async () => {
      const a = await criar()
      const b = await criar()
      expect(Number(b.codigo.slice(7))).toBe(Number(a.codigo.slice(7)) + 1)
    })

    it('criacoes simultaneas nao colidem no codigo (retry)', async () => {
      const rs = await Promise.all(Array.from({ length: 5 }, () =>
        chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A))))
      expect(rs.map((r) => r.status)).toEqual([201, 201, 201, 201, 201])
      expect(new Set(rs.map((r) => r.corpo.codigo)).size).toBe(5)
    })

    it('marca ultimo_uso_em do endereco e emite auditoria sem PII', async () => {
      const p = await criar()
      const e = await poolSuper.query('select ultimo_uso_em from public.enderecos where id = $1', [m.A.endereco])
      expect(e.rows[0].ultimo_uso_em).not.toBeNull()
      const ev = await poolSuper.query(
        "select detalhes from public.eventos where tipo = 'pedido.criado' and entidade_id = $1", [p.id])
      const txt = JSON.stringify(ev.rows)
      expect(ev.rowCount).toBe(1)
      expect(txt).not.toContain(NOME_CLIENTE)
      expect(txt).not.toContain(LOGRADOURO)
    })

    it('retirada: sem endereco e sem taxa; entrega exige endereco', async () => {
      const ret = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { modalidade: 'retirada', endereco_id: undefined, taxa_entrega_centavos: 0 }))
      expect(ret.status).toBe(201)
      expect(ret.corpo.total_centavos).toBe(ret.corpo.subtotal_centavos)
      expect(ret.corpo.endereco).toBeNull()
      const comTaxa = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { modalidade: 'retirada', endereco_id: undefined }))
      expect(comTaxa.status).toBe(422)
      const semEnd = await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { endereco_id: undefined }))
      expect(semEnd.status).toBe(422)
      expect(semEnd.corpo.error.code).toBe('endereco_obrigatorio')
    })

    it('erros do montador viram 422 no envelope', async () => {
      const semTamanho = corpoPadrao(m.A, { itens: [{ item_id: m.A.cardapio.burger, quantidade: 1, opcoes_ids: [] }] })
      const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', semTamanho)
      expect(r.status).toBe(422)
      expect(r.corpo.error.code).toBe('grupo_obrigatorio')
    })

    it('SEC-081: Zod rejeita preco do cliente, quantidade <= 0, enum invalido e loja_id no corpo', async () => {
      const base = corpoPadrao(m.A)
      const item = base.itens[0]!
      const casos: Record<string, unknown>[] = [
        { ...base, itens: [{ ...item, preco_centavos: 1 }] },
        { ...base, total_centavos: 1 },
        { ...base, itens: [{ ...item, quantidade: 0 }] },
        { ...base, itens: [{ ...item, quantidade: -1 }] },
        { ...base, modalidade: 'voando' },
        { ...base, loja_id: m.B.loja },
        { ...base, taxa_entrega_centavos: -5 },
        { ...base, taxa_entrega_centavos: 1.5 },
        { ...base, itens: [] },
      ]
      for (const c of casos) {
        const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', c)
        expect(r.status, JSON.stringify(c)).toBe(400)
        expect(r.corpo.error.code).toBe('entrada_invalida')
      }
    })
  })

  describe('snapshot', () => {
    it('mudar nome/preco no cardapio depois nao altera o pedido nem a impressao', async () => {
      const p = await criar()
      const antes = (await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}`)).corpo
      const impAntes = (await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}/impressao?formato=texto`)).corpo.conteudo
      await poolSuper.query("update public.itens set nome = 'Burger Premium', preco_centavos = 9999 where id = $1", [m.A.cardapio.burger])
      await poolSuper.query("update public.opcoes set nome = 'Gigante', preco_centavos = 7777 where id = $1", [m.A.cardapio.grande])
      const depois = (await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}`)).corpo
      expect(depois.itens).toEqual(antes.itens)
      expect(depois.total_centavos).toBe(antes.total_centavos)
      const impDepois = (await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}/impressao?formato=texto`)).corpo.conteudo
      expect(impDepois).toBe(impAntes)
      expect(impDepois).toContain('Burger')
      expect(impDepois).not.toContain('Premium')
      // novo pedido usa o preco vivo
      const novo = await criar()
      const n = (await chamar(m, m.dono, m.A.loja, 'GET', `/${novo.id}`)).corpo
      expect(n.itens[0].preco_unitario_centavos).toBe(9999)
      await poolSuper.query("update public.itens set nome = 'Burger', preco_centavos = 2000 where id = $1", [m.A.cardapio.burger])
      await poolSuper.query("update public.opcoes set nome = 'Grande', preco_centavos = 500 where id = $1", [m.A.cardapio.grande])
    })
  })

  describe('kanban e transicoes', () => {
    it('rascunho do atendente nao aparece no kanban; confirmar faz aparecer', async () => {
      const r = await poolSuper.query(
        `insert into public.pedidos (loja_id, codigo, status, origem, subtotal_centavos, total_centavos)
         values ($1, 'RASC-1', 'rascunho', 'whatsapp', 100, 100) returning id`, [m.A.loja])
      const id = r.rows[0].id as string
      const k1 = await chamar(m, m.dono, m.A.loja, 'GET', '/')
      const todos = (c: typeof k1) => Object.values(c.corpo.colunas as Record<string, { itens: { id: string }[] }>).flatMap((x) => x.itens.map((i) => i.id))
      expect(todos(k1)).not.toContain(id)
      // atendente (role de banco) so confirma rascunho -> novo; nao move novo -> em_preparo
      const cli = await poolSuper.connect()
      try {
        await cli.query('begin')
        await cli.query('set local role whaviso_atendente')
        const conf = await cli.query("update public.pedidos set status = 'novo' where id = $1", [id])
        expect(conf.rowCount).toBe(1)
        const mov = await cli.query("update public.pedidos set status = 'em_preparo' where id = $1", [id])
        expect(mov.rowCount).toBe(0)
        await cli.query('commit')
      } finally {
        cli.release()
      }
      const k2 = await chamar(m, m.dono, m.A.loja, 'GET', '/?limite=100')
      expect(todos(k2)).toContain(id)
    })

    it('fluxo feliz de entrega: novo -> em_preparo -> saiu_entrega -> entregue (entregue_em carimbado)', async () => {
      const p = await criar()
      for (const para of ['em_preparo', 'saiu_entrega', 'entregue']) {
        const r = await mover(p.id, para)
        expect(r.status, para).toBe(200)
        expect(r.corpo.status).toBe(para)
      }
      const f = (await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}`)).corpo
      expect(f.entregue_em).not.toBeNull()
      expect(f.destinos).toEqual([])
    })

    it('retirada pula saiu_entrega; entrega nao pula', async () => {
      const ret = (await chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, { modalidade: 'retirada', endereco_id: undefined, taxa_entrega_centavos: 0 }))).corpo
      await mover(ret.id, 'em_preparo')
      expect((await mover(ret.id, 'saiu_entrega')).status).toBe(409)
      expect((await mover(ret.id, 'entregue')).status).toBe(200)
      const ent = await criar()
      await mover(ent.id, 'em_preparo')
      const r = await mover(ent.id, 'entregue')
      expect(r.status).toBe(409)
      expect(r.corpo.error.code).toBe('transicao_invalida')
    })

    it('transicoes invalidas dao 409 (retrocesso, repetir, saltar)', async () => {
      const p = await criar()
      expect((await mover(p.id, 'entregue')).status).toBe(409)
      expect((await mover(p.id, 'saiu_entrega')).status).toBe(409)
      expect((await mover(p.id, 'novo')).status).toBe(409)
      await mover(p.id, 'em_preparo')
      expect((await mover(p.id, 'novo')).status).toBe(409)
      expect((await mover(p.id, 'rascunho')).status).toBe(409)
    })

    it('problema exige motivo (422), grava motivo e permite retomar', async () => {
      const p = await criar()
      const sem = await mover(p.id, 'problema')
      expect(sem.status).toBe(422)
      expect(sem.corpo.error.code).toBe('motivo_obrigatorio')
      const ok = await mover(p.id, 'problema', 'cliente nao atendeu')
      expect(ok.status).toBe(200)
      expect(ok.corpo.problema_motivo).toBe('cliente nao atendeu')
      expect((await mover(p.id, 'em_preparo')).status).toBe(200)
      // pedido entregue e terminal
      await mover(p.id, 'saiu_entrega')
      await mover(p.id, 'entregue')
      expect((await mover(p.id, 'problema', 'x')).status).toBe(409)
    })

    it('check do banco tambem barra problema sem motivo', async () => {
      const p = await criar()
      await expect(poolApi.query("update public.pedidos set status = 'problema' where id = $1", [p.id])).rejects.toThrow()
    })

    it('corrida: duas mudancas simultaneas, so uma vence', async () => {
      const p = await criar()
      const [a, b] = await Promise.all([mover(p.id, 'em_preparo'), mover(p.id, 'problema', 'x')])
      expect([a.status, b.status].sort()).toEqual([200, 409])
    })

    it('kanban: colunas, filtros, paginacao por cursor e destinos', async () => {
      const lote = []
      for (let i = 0; i < 3; i++) lote.push(await criar())
      const k = await chamar(m, m.dono, m.A.loja, 'GET', '/?coluna=novo&limite=2')
      expect(k.status).toBe(200)
      expect(Object.keys(k.corpo.colunas)).toEqual(['novo'])
      expect(k.corpo.colunas.novo.itens).toHaveLength(2)
      expect(k.corpo.colunas.novo.proximoCursor).not.toBeNull()
      const p2 = await chamar(m, m.dono, m.A.loja, 'GET', `/?coluna=novo&limite=2&cursor=${k.corpo.colunas.novo.proximoCursor}`)
      const ids1 = k.corpo.colunas.novo.itens.map((i: { id: string }) => i.id)
      const ids2 = p2.corpo.colunas.novo.itens.map((i: { id: string }) => i.id)
      expect(ids2.some((i: string) => ids1.includes(i))).toBe(false)
      expect(lote.length).toBe(3)
      const card = k.corpo.colunas.novo.itens[0]
      expect(card.cliente_nome).toBe(NOME_CLIENTE)
      expect(card.destinos).toEqual(['em_preparo', 'problema'])
      const ret = await chamar(m, m.dono, m.A.loja, 'GET', '/?modalidade=retirada&coluna=novo')
      expect(ret.corpo.colunas.novo.itens.every((i: { modalidade: string }) => i.modalidade === 'retirada')).toBe(true)
      const semCol = await chamar(m, m.dono, m.A.loja, 'GET', `/?cursor=${k.corpo.colunas.novo.proximoCursor}`)
      expect(semCol.status).toBe(400)
      const ruim = await chamar(m, m.dono, m.A.loja, 'GET', '/?coluna=novo&cursor=lixo')
      expect(ruim.status).toBe(400)
      const todas = await chamar(m, m.dono, m.A.loja, 'GET', '/')
      expect(Object.keys(todas.corpo.colunas)).toEqual(['novo', 'em_preparo', 'saiu_entrega', 'entregue', 'problema'])
    })
  })

  describe('repetir pedido inteiro (G13)', () => {
    it('cria um pedido novo espelhando os itens do anterior, reresolvendo preco de agora', async () => {
      const original = await criar()
      const det = (await chamar(m, m.dono, m.A.loja, 'GET', `/${original.id}`)).corpo
      const r = await chamar(m, m.dono, m.A.loja, 'POST', `/${original.id}/repetir`, {})
      expect(r.status, JSON.stringify(r.corpo)).toBe(201)
      expect(r.corpo.id).not.toBe(original.id)
      expect(r.corpo.status).toBe('novo')
      expect(r.corpo.origem).toBe('manual')
      // Mesmos itens e opcoes (snapshot), mesmos totais (cardapio inalterado).
      expect(r.corpo.subtotal_centavos).toBe(det.subtotal_centavos)
      expect(r.corpo.total_centavos).toBe(det.total_centavos)
      expect(r.corpo.itens.map((i: { nome_snapshot: string }) => i.nome_snapshot)).toEqual(
        det.itens.map((i: { nome_snapshot: string }) => i.nome_snapshot))
      expect(r.corpo.itens[0].opcoes.map((o: { nome_snapshot: string }) => o.nome_snapshot).sort()).toEqual(['Bacon', 'Grande'])
      expect(r.corpo.cliente.id).toBe(det.cliente.id)
      expect(r.corpo.endereco.id).toBe(det.endereco.id)
      // Auditoria carrega a origem (repetido_de), sem PII.
      const ev = await poolSuper.query(
        "select detalhes from public.eventos where tipo = 'pedido.criado' and entidade_id = $1", [r.corpo.id])
      expect(ev.rows[0].detalhes.repetido_de).toBe(original.id)
      expect(JSON.stringify(ev.rows)).not.toContain(NOME_CLIENTE)
    })

    it('reresolve o preco atual do cardapio ao repetir', async () => {
      const original = await criar()
      await poolSuper.query('update public.itens set preco_centavos = 3000 where id = $1', [m.A.cardapio.burger])
      try {
        const r = await chamar(m, m.dono, m.A.loja, 'POST', `/${original.id}/repetir`, {})
        expect(r.status).toBe(201)
        // (3000 + 500 grande + 300 bacon) x 2 = 7600 ; original era 5600
        expect(r.corpo.subtotal_centavos).toBe(7600)
        expect(r.corpo.itens[0].preco_unitario_centavos).toBe(3000)
      } finally {
        await poolSuper.query('update public.itens set preco_centavos = 2000 where id = $1', [m.A.cardapio.burger])
      }
    })

    it('rejeita 422 quando um item do anterior nao e mais pedivel, dizendo qual', async () => {
      const original = await criar()
      await poolSuper.query('update public.itens set ativo = false where id = $1', [m.A.cardapio.burger])
      try {
        const r = await chamar(m, m.dono, m.A.loja, 'POST', `/${original.id}/repetir`, {})
        expect(r.status).toBe(422)
        expect(r.corpo.error.code).toBe('itens_indisponiveis')
        expect(r.corpo.error.message).toContain('Burger')
      } finally {
        await poolSuper.query('update public.itens set ativo = true where id = $1', [m.A.cardapio.burger])
      }
    })

    it('SEC-001: nao repete pedido de outra loja (404)', async () => {
      const original = await criar()
      const r = await chamar(m, m.donoB, m.B.loja, 'POST', `/${original.id}/repetir`, {})
      expect(r.status).toBe(404)
    })
  })

  describe('transicao de status em lote (POST /transicao)', () => {
    const prep = async () => {
      const p = await criar()
      await mover(p.id, 'em_preparo')
      return p.id
    }
    it('move varios pedidos atomicamente e e idempotente no alvo', async () => {
      const [a, b] = [await prep(), await prep()]
      const r = await chamar(m, m.dono, m.A.loja, 'POST', '/transicao', { pedido_ids: [a, b], para: 'saiu_entrega' })
      expect(r.status, JSON.stringify(r.corpo)).toBe(200)
      expect(r.corpo.resultados.every((x: { mudou: boolean }) => x.mudou)).toBe(true)
      for (const id of [a, b]) expect((await chamar(m, m.dono, m.A.loja, 'GET', `/${id}`)).corpo.status).toBe('saiu_entrega')
      // Repetir o mesmo lote: ja no alvo, no-op (mudou=false), continua 200.
      const r2 = await chamar(m, m.dono, m.A.loja, 'POST', '/transicao', { pedido_ids: [a, b], para: 'saiu_entrega' })
      expect(r2.status).toBe(200)
      expect(r2.corpo.resultados.every((x: { mudou: boolean }) => x.mudou === false)).toBe(true)
    })

    it('transicao invalida em qualquer pedido rejeita o lote inteiro (nada aplicado)', async () => {
      const bom = await prep()
      const ruim = await criar() // fica em novo: novo -> saiu_entrega e invalido
      const r = await chamar(m, m.dono, m.A.loja, 'POST', '/transicao', { pedido_ids: [bom, ruim.id], para: 'saiu_entrega' })
      expect(r.status).toBe(409)
      expect(r.corpo.error.code).toBe('transicao_invalida')
      // Tudo ou nada: o pedido valido NAO foi movido.
      expect((await chamar(m, m.dono, m.A.loja, 'GET', `/${bom}`)).corpo.status).toBe('em_preparo')
    })

    it('problema em lote exige motivo (422)', async () => {
      const a = await prep()
      const r = await chamar(m, m.dono, m.A.loja, 'POST', '/transicao', { pedido_ids: [a], para: 'problema' })
      expect(r.status).toBe(422)
      expect(r.corpo.error.code).toBe('motivo_obrigatorio')
    })

    it('SEC-001: lote com pedido de outra loja nao e encontrado (404)', async () => {
      const a = await prep()
      const r = await chamar(m, m.donoB, m.B.loja, 'POST', '/transicao', { pedido_ids: [a], para: 'saiu_entrega' })
      expect(r.status).toBe(404)
    })
  })

  describe('cancelar linha', () => {
    it('recalcula subtotal e total; nao cancela a ultima linha; so em novo/em_preparo', async () => {
      const corpo = corpoPadrao(m.A, {
        itens: [
          { item_id: m.A.cardapio.burger, quantidade: 1, opcoes_ids: [m.A.cardapio.pequena] },
          { item_id: m.A.cardapio.suco, quantidade: 2, opcoes_ids: [] },
        ],
      })
      const p = (await chamar(m, m.dono, m.A.loja, 'POST', '/', corpo)).corpo
      expect(p.subtotal_centavos).toBe(2000 + 1600)
      const suco = p.itens.find((i: { nome_snapshot: string }) => i.nome_snapshot === 'Suco')
      const burger = p.itens.find((i: { nome_snapshot: string }) => i.nome_snapshot === 'Burger')
      const r = await chamar(m, m.dono, m.A.loja, 'POST', `/${p.id}/itens/${suco.id}/cancelar`)
      expect(r.status).toBe(200)
      expect(r.corpo.subtotal_centavos).toBe(2000)
      expect(r.corpo.total_centavos).toBe(2000 + 500)
      expect(r.corpo.itens.find((i: { id: string }) => i.id === suco.id).cancelado).toBe(true)
      const repetido = await chamar(m, m.dono, m.A.loja, 'POST', `/${p.id}/itens/${suco.id}/cancelar`)
      expect(repetido.status).toBe(404)
      const ultima = await chamar(m, m.dono, m.A.loja, 'POST', `/${p.id}/itens/${burger.id}/cancelar`)
      expect(ultima.status).toBe(422)
      expect(ultima.corpo.error.code).toBe('ultima_linha')
      // rollback: o burger segue ativo
      const ainda = (await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}`)).corpo
      expect(ainda.itens.find((i: { id: string }) => i.id === burger.id).cancelado).toBe(false)
      await mover(p.id, 'em_preparo')
      await mover(p.id, 'saiu_entrega')
      const tarde = await chamar(m, m.dono, m.A.loja, 'POST', `/${p.id}/itens/${burger.id}/cancelar`)
      expect(tarde.status).toBe(409)
      expect(tarde.corpo.error.code).toBe('pedido_nao_editavel')
    })
  })

  describe('impressao', () => {
    it('texto e html so do snapshot, sem telefone, no-store, largura 32/48', async () => {
      const p = await criar()
      const t = await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}/impressao?formato=texto&largura=32`)
      expect(t.status).toBe(200)
      expect(t.headers['cache-control']).toBe('no-store')
      const linhas = (t.corpo.conteudo as string).split('\n')
      expect(linhas.every((l) => l.length <= 32)).toBe(true)
      expect(t.corpo.conteudo).toContain(p.codigo)
      expect(t.corpo.conteudo).toContain('2x Burger')
      expect(t.corpo.conteudo).toContain('TOTAL')
      expect(t.corpo.conteudo).not.toContain(TELEFONE)
      expect(t.corpo.conteudo).not.toContain('1234')
      const h = await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}/impressao?formato=html`)
      expect(h.corpo.formato).toBe('html')
      expect(h.corpo.conteudo).toContain('<!doctype html>')
      expect(h.corpo.conteudo).toContain('@media print')
      const ev = await poolSuper.query("select 1 from public.eventos where tipo = 'pedido.impresso' and entidade_id = $1", [p.id])
      expect(ev.rowCount).toBeGreaterThanOrEqual(2)
      const ruim = await chamar(m, m.dono, m.A.loja, 'GET', `/${p.id}/impressao?largura=20`)
      expect(ruim.status).toBe(400)
    })
  })

  describe('realtime', () => {
    it('emite pedido.atualizado so com referencia (sem PII) ao criar e ao mover', async () => {
      const cli = await poolSuper.connect()
      const recebidas: string[] = []
      cli.on('notification', (n) => { if (n.payload) recebidas.push(n.payload) })
      await cli.query('LISTEN whaviso_eventos')
      try {
        const p = await criar()
        await mover(p.id, 'em_preparo')
        await new Promise((r) => setTimeout(r, 300))
        const meus = recebidas.map((x) => JSON.parse(x) as { tipo: string; payload: Record<string, string> })
          .filter((e) => e.payload['pedido_id'] === p.id)
        expect(meus.map((e) => e.payload['status'])).toEqual(['novo', 'em_preparo'])
        for (const e of meus) {
          expect(e.tipo).toBe('pedido.atualizado')
          expect(Object.keys(e.payload).sort()).toEqual(['loja_id', 'pedido_id', 'status'])
        }
        const bruto = recebidas.join('')
        expect(bruto).not.toContain(NOME_CLIENTE)
        expect(bruto).not.toContain(LOGRADOURO)
      } finally {
        cli.release()
      }
    })
  })
})
