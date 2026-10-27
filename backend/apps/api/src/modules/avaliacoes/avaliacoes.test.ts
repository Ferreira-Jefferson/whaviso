// Integracao do modulo avaliacoes contra o Postgres local (role whaviso_api).
// Cobre registro (regras de pedido), unicidade, leitura, agregados, isolamento multi-tenant,
// permissao por papel, append-only e ausencia de PII/comentario em eventos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { avaliacoesRoutes } from './routes'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[avaliacoes] banco inacessivel: integracao PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('avaliacoes-teste', 'silent'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'avaliacoes', plugin: avaliacoesRoutes }],
  })
  await app.ready()
  return app
}

d('modulo avaliacoes (integracao)', () => {
  const cen = novoCenario()
  const lojasCriadas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let donoA: string, atendA: string, donoB: string
  let lojaA: string, lojaB: string
  let clienteA = ''
  const pedidos: Record<string, string> = {}

  const chamar = (
    user: string,
    loja: string | null,
    metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method: metodo,
      url: `/v1/avaliacoes${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  async function pedido(loja: string, cliente: string | null, codigo: string, status: string) {
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.pedidos (loja_id, cliente_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1,$2,$3,$4,1000,1000) returning id`,
      [loja, cliente, codigo, status],
    )
    return rows[0]!.id
  }

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    atendA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    lojasCriadas.push(lojaA, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaA, atendA, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    const c = await poolSuper.query<{ id: string }>(
      `insert into public.clientes (loja_id, telefone_hash, nome) values ($1, $2, 'Maria') returning id`,
      [lojaA, 'a'.repeat(64)],
    )
    clienteA = c.rows[0]!.id
    pedidos.e1 = await pedido(lojaA, clienteA, 'A1', 'entregue')
    pedidos.e2 = await pedido(lojaA, clienteA, 'A2', 'entregue')
    pedidos.e3 = await pedido(lojaA, clienteA, 'A3', 'entregue')
    pedidos.novo = await pedido(lojaA, clienteA, 'A4', 'novo')
    pedidos.semCli = await pedido(lojaA, null, 'A5', 'entregue')
    app = await montar()
  })

  afterAll(async () => {
    await app?.close()
    for (const l of lojasCriadas) {
      await poolSuper.query('delete from public.avaliacoes where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.pedidos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.clientes where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  let avaliacaoId = ''
  it('registra: 201 com pedido, cliente e nota; comentario aparado', async () => {
    const r = await chamar(atendA, lojaA, 'POST', '', { pedido_id: pedidos.e1, nota: 5, comentario: '  Chegou quente  ' })
    expect(r.statusCode).toBe(201)
    const a = r.json()
    avaliacaoId = a.id
    expect(a).toMatchObject({
      pedido_id: pedidos.e1, pedido_codigo: 'A1', cliente_id: clienteA, cliente_nome: 'Maria',
      nota: 5, comentario: 'Chegou quente',
    })
    expect(a.criado_em).toMatch(/Z$/)
  })

  it('segunda avaliacao do mesmo pedido: 422 avaliacao_ja_registrada', async () => {
    const r = await chamar(donoA, lojaA, 'POST', '', { pedido_id: pedidos.e1, nota: 1 })
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('avaliacao_ja_registrada')
  })

  it('pedido nao entregue / sem cliente: 422; pedido inexistente: 404', async () => {
    const a = await chamar(donoA, lojaA, 'POST', '', { pedido_id: pedidos.novo, nota: 4 })
    expect(a.statusCode).toBe(422)
    expect(a.json().error.code).toBe('pedido_nao_entregue')
    const b = await chamar(donoA, lojaA, 'POST', '', { pedido_id: pedidos.semCli, nota: 4 })
    expect(b.statusCode).toBe(422)
    expect(b.json().error.code).toBe('pedido_sem_cliente')
    const c = await chamar(donoA, lojaA, 'POST', '', { pedido_id: crypto.randomUUID(), nota: 4 })
    expect(c.statusCode).toBe(404)
  })

  it('entrada invalida: nota fora de 1..5, campo extra (loja_id), comentario vazio: 400', async () => {
    for (const body of [
      { pedido_id: pedidos.e2, nota: 0 },
      { pedido_id: pedidos.e2, nota: 6 },
      { pedido_id: pedidos.e2, nota: 3.5 },
      { pedido_id: pedidos.e2, nota: 3, loja_id: lojaB },
      { pedido_id: pedidos.e2, nota: 3, comentario: '   ' },
    ]) {
      const r = await chamar(donoA, lojaA, 'POST', '', body)
      expect(r.statusCode).toBe(400)
      expect(r.json().error.code).toBe('entrada_invalida')
    }
  })

  it('loja de outro tenant nao avalia pedido alheio (404) e nao le', async () => {
    const r = await chamar(donoB, lojaB, 'POST', '', { pedido_id: pedidos.e2, nota: 2 })
    expect(r.statusCode).toBe(404)
    const lista = (await chamar(donoB, lojaB, 'GET', '')).json()
    expect(lista.itens).toHaveLength(0)
    const det = await chamar(donoB, lojaB, 'GET', `/${avaliacaoId}`)
    expect(det.statusCode).toBe(404)
    const sem = await chamar(donoB, lojaA, 'GET', '')
    expect(sem.statusCode).toBeGreaterThanOrEqual(403)
  })

  it('lista, filtro por nota, detalhe e paginacao por cursor', async () => {
    await chamar(donoA, lojaA, 'POST', '', { pedido_id: pedidos.e2, nota: 3 })
    await chamar(donoA, lojaA, 'POST', '', { pedido_id: pedidos.e3, nota: 3, comentario: 'Demorou' })
    const todas = (await chamar(donoA, lojaA, 'GET', '')).json()
    expect(todas.itens).toHaveLength(3)
    const datas = todas.itens.map((i: { criado_em: string }) => i.criado_em)
    expect([...datas].sort().reverse()).toEqual(datas)
    const tres = (await chamar(donoA, lojaA, 'GET', '?nota=3')).json()
    expect(tres.itens).toHaveLength(2)
    const det = await chamar(donoA, lojaA, 'GET', `/${avaliacaoId}`)
    expect(det.statusCode).toBe(200)
    expect(det.json().nota).toBe(5)

    const p1 = (await chamar(donoA, lojaA, 'GET', '?limite=2')).json()
    expect(p1.itens).toHaveLength(2)
    expect(p1.proximoCursor).toBeTruthy()
    const p2 = (await chamar(donoA, lojaA, 'GET', `?limite=2&cursor=${p1.proximoCursor}`)).json()
    expect(p2.itens).toHaveLength(1)
    expect(p2.proximoCursor).toBeNull()
    const ids = [...p1.itens, ...p2.itens].map((i: { id: string }) => i.id)
    expect(new Set(ids).size).toBe(3)
    const ruim = await chamar(donoA, lojaA, 'GET', '?cursor=lixo')
    expect(ruim.statusCode).toBe(400)
    expect(ruim.json().error.code).toBe('cursor_invalido')
  })

  it('resumo: total, media e distribuicao; loja vazia devolve media null', async () => {
    const r = (await chamar(donoA, lojaA, 'GET', '/resumo')).json()
    expect(r).toEqual({ total: 3, media: 3.67, distribuicao: { '1': 0, '2': 0, '3': 2, '4': 0, '5': 1 } })
    const vazio = (await chamar(donoB, lojaB, 'GET', '/resumo')).json()
    expect(vazio).toEqual({ total: 0, media: null, distribuicao: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } })
  })

  it('permissao: atendente registra mas nao le relatorio (403)', async () => {
    const r = await chamar(atendA, lojaA, 'GET', '/resumo')
    expect(r.statusCode).toBe(403)
    const l = await chamar(atendA, lojaA, 'GET', '')
    expect(l.statusCode).toBe(403)
  })

  it('append-only: api nao faz UPDATE nem DELETE em avaliacoes', async () => {
    const c = await poolApi.connect()
    try {
      await expect(c.query('update public.avaliacoes set nota = 1')).rejects.toThrow(/permission denied|permiss.o negada/)
      await expect(c.query('delete from public.avaliacoes')).rejects.toThrow(/permission denied|permiss.o negada/)
    } finally {
      c.release()
    }
  })

  it('nota fora de 1..5 e barrada tambem no banco; unique por pedido', async () => {
    await expect(
      poolSuper.query(
        `insert into public.avaliacoes (loja_id, pedido_id, cliente_id, nota) values ($1,$2,$3,9)`,
        [lojaA, pedidos.novo, clienteA],
      ),
    ).rejects.toThrow(/avaliacoes_nota_check/)
    await expect(
      poolSuper.query(
        `insert into public.avaliacoes (loja_id, pedido_id, cliente_id, nota) values ($1,$2,$3,4)`,
        [lojaA, pedidos.e1, clienteA],
      ),
    ).rejects.toThrow(/avaliacoes_pedido/)
  })

  it('auditoria sem PII: evento guarda user_id e nota, nunca o comentario', async () => {
    const { rows } = await poolSuper.query<{ t: string }>(
      `select detalhes::text as t from public.eventos where loja_id = $1 and tipo = 'avaliacao.registrada'`,
      [lojaA],
    )
    expect(rows.length).toBe(3)
    for (const l of rows) {
      expect(l.t).not.toMatch(/Chegou quente|Demorou/)
      expect(l.t).toContain('nota')
    }
  })
})
