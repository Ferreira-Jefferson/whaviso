// Integracao do modulo fidelidade contra o Postgres local (role whaviso_api).
// Cobre programa, acumulo, resgate (limites, saldo, concorrencia), livro append-only, isolamento
// multi-tenant, permissao por papel e unidades puras de calculo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { fidelidadeRoutes } from './routes'
import { calcularAcumulo, valorEmCentavos } from './service'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

describe('fidelidade (calculo puro)', () => {
  const base = {
    ativo: true, cashback_bps: 500, pontos_por_real: 2, valor_ponto_centavos: 5,
    minimo_resgate: 0, max_resgate_bps: 5000,
  }
  it('cashback: percentual em bps com arredondamento para baixo', () => {
    expect(calcularAcumulo({ ...base, modo: 'cashback' }, 10000)).toBe(500)
    expect(calcularAcumulo({ ...base, modo: 'cashback' }, 1999)).toBe(99)
    expect(calcularAcumulo({ ...base, modo: 'cashback' }, 0)).toBe(0)
  })
  it('pontos: pontos por real, e valor do resgate em centavos', () => {
    expect(calcularAcumulo({ ...base, modo: 'pontos' }, 10000)).toBe(200)
    expect(calcularAcumulo({ ...base, modo: 'pontos' }, 99)).toBe(1)
    expect(valorEmCentavos({ modo: 'pontos', valor_ponto_centavos: 5 }, 100)).toBe(500)
    expect(valorEmCentavos({ modo: 'cashback', valor_ponto_centavos: 5 }, 100)).toBe(100)
  })
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[fidelidade] banco inacessivel: integracao PULADA.')

async function montar() {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: true },
    pool: poolApi,
    logger: criarLogger('fidelidade-teste', 'silent'),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'fidelidade', plugin: fidelidadeRoutes }],
  })
  await app.ready()
  return app
}

const CASHBACK = {
  ativo: true, modo: 'cashback', cashback_bps: 500, pontos_por_real: 1, valor_ponto_centavos: 1,
  minimo_resgate: 100, max_resgate_bps: 5000,
}

d('modulo fidelidade (integracao)', () => {
  const cen = novoCenario()
  const lojasCriadas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let donoA: string, atendA: string, donoB: string
  let lojaA: string, lojaB: string
  let clienteA = '', clienteB = ''
  const ped: Record<string, string> = {}

  const chamar = (
    user: string, loja: string | null, metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown,
  ) =>
    app.inject({
      method: metodo,
      url: `/v1/fidelidade${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  async function pedido(loja: string, cliente: string | null, codigo: string, status: string, subtotal = 10000) {
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.pedidos (loja_id, cliente_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1,$2,$3,$4,$5,$5) returning id`,
      [loja, cliente, codigo, status, subtotal],
    )
    return rows[0]!.id
  }
  async function cliente(loja: string, hash: string) {
    const c = await poolSuper.query<{ id: string }>(
      `insert into public.clientes (loja_id, telefone_hash, nome) values ($1, $2, 'Maria') returning id`,
      [loja, hash.repeat(64)],
    )
    return c.rows[0]!.id
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
    clienteA = await cliente(lojaA, 'a')
    clienteB = await cliente(lojaB, 'b')
    ped.e1 = await pedido(lojaA, clienteA, 'A1', 'entregue')
    ped.e2 = await pedido(lojaA, clienteA, 'A2', 'entregue')
    ped.n1 = await pedido(lojaA, clienteA, 'A3', 'novo')
    ped.n2 = await pedido(lojaA, clienteA, 'A4', 'novo')
    ped.pequeno = await pedido(lojaA, clienteA, 'A5', 'novo', 1000)
    ped.semCli = await pedido(lojaA, null, 'A6', 'entregue')
    ped.x = await pedido(lojaA, clienteA, 'A7', 'novo')
    ped.n3 = await pedido(lojaA, clienteA, 'A8', 'novo')
    ped.n4 = await pedido(lojaA, clienteA, 'A9', 'novo')
    ped.b1 = await pedido(lojaB, clienteB, 'B1', 'entregue')
    ped.b2 = await pedido(lojaB, clienteB, 'B2', 'novo')
    app = await montar()
  })

  afterAll(async () => {
    await app?.close()
    for (const l of lojasCriadas) {
      await poolSuper.query('delete from public.fidelidade_movimentos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.fidelidade_programas where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.pedidos where loja_id = $1', [l]).catch(() => {})
      await poolSuper.query('delete from public.clientes where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  it('sem programa: GET devolve padrao inativo; acumular e resgatar dao 422', async () => {
    const p = (await chamar(donoA, lojaA, 'GET', '/programa')).json()
    expect(p).toMatchObject({ configurado: false, ativo: false, modo: 'cashback', atualizado_em: null })
    const a = await chamar(atendA, lojaA, 'POST', '/acumular', { pedido_id: ped.e1 })
    expect(a.statusCode).toBe(422)
    expect(a.json().error.code).toBe('programa_nao_configurado')
  })

  it('configurar exige loja:gerir (atendente 403); dono salva e le', async () => {
    const neg = await chamar(atendA, lojaA, 'PUT', '/programa', CASHBACK)
    expect(neg.statusCode).toBe(403)
    const r = await chamar(donoA, lojaA, 'PUT', '/programa', CASHBACK)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ configurado: true, ativo: true, modo: 'cashback', cashback_bps: 500 })
    expect(r.json().atualizado_em).toMatch(/Z$/)
    const le = await chamar(atendA, lojaA, 'GET', '/programa')
    expect(le.statusCode).toBe(200)
  })

  it('programa: entrada invalida (faixa, campo extra loja_id) da 400', async () => {
    for (const body of [
      { ...CASHBACK, cashback_bps: 10001 },
      { ...CASHBACK, modo: 'milhas' },
      { ...CASHBACK, max_resgate_bps: 0 },
      { ...CASHBACK, loja_id: lojaB },
    ]) {
      const r = await chamar(donoA, lojaA, 'PUT', '/programa', body)
      expect(r.statusCode).toBe(400)
      expect(r.json().error.code).toBe('entrada_invalida')
    }
  })

  it('acumula no pedido entregue: 5% do subtotal; saldo e saldo_apos conferem', async () => {
    const r = await chamar(atendA, lojaA, 'POST', '/acumular', { pedido_id: ped.e1 })
    expect(r.statusCode).toBe(201)
    const b = r.json()
    expect(b.saldo).toBe(500)
    expect(b.movimento).toMatchObject({
      pedido_id: ped.e1, pedido_codigo: 'A1', cliente_id: clienteA, tipo: 'acumulo', valor: 500,
      desconto_centavos: null, saldo_apos: 500,
    })
    const s = (await chamar(atendA, lojaA, 'GET', `/clientes/${clienteA}/saldo`)).json()
    expect(s).toEqual({ cliente_id: clienteA, modo: 'cashback', saldo: 500, saldo_centavos: 500 })
  })

  it('acumulo: repetido 422; pedido nao entregue 422; sem cliente 422; inexistente 404', async () => {
    const rep = await chamar(donoA, lojaA, 'POST', '/acumular', { pedido_id: ped.e1 })
    expect(rep.statusCode).toBe(422)
    expect(rep.json().error.code).toBe('acumulo_ja_registrado')
    const n = await chamar(donoA, lojaA, 'POST', '/acumular', { pedido_id: ped.n1 })
    expect(n.json().error.code).toBe('pedido_nao_entregue')
    const s = await chamar(donoA, lojaA, 'POST', '/acumular', { pedido_id: ped.semCli })
    expect(s.json().error.code).toBe('pedido_sem_cliente')
    const x = await chamar(donoA, lojaA, 'POST', '/acumular', { pedido_id: crypto.randomUUID() })
    expect(x.statusCode).toBe(404)
  })

  it('resgate: saldo insuficiente, abaixo do minimo e acima do limite do pedido (422)', async () => {
    const a = await chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: ped.n1, valor: 600 })
    expect(a.statusCode).toBe(422)
    expect(a.json().error.code).toBe('saldo_insuficiente')
    const b = await chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: ped.n1, valor: 50 })
    expect(b.json().error.code).toBe('resgate_abaixo_do_minimo')
    const c = await chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: ped.pequeno, valor: 600 })
    expect(c.json().error.code).toBe('resgate_acima_do_limite')
    const e = await chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: ped.e2, valor: 200 })
    expect(e.json().error.code).toBe('pedido_encerrado')
  })

  it('resgata no pedido aberto: debita o livro e devolve o desconto em centavos', async () => {
    const r = await chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: ped.n1, valor: 500 })
    expect(r.statusCode).toBe(201)
    const b = r.json()
    expect(b).toMatchObject({ saldo: 0, desconto_centavos: 500 })
    expect(b.movimento).toMatchObject({ tipo: 'resgate', valor: 500, desconto_centavos: 500, saldo_apos: 0 })
    const s = (await chamar(atendA, lojaA, 'GET', `/clientes/${clienteA}/saldo`)).json()
    expect(s.saldo).toBe(0)
  })

  it('segundo resgate no mesmo pedido: 422 resgate_ja_registrado (com saldo)', async () => {
    await chamar(donoA, lojaA, 'POST', '/acumular', { pedido_id: ped.e2 }) // +500
    const r = await chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: ped.n1, valor: 500 })
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('resgate_ja_registrado')
  })

  it('base do acumulo abate o desconto de resgate do mesmo pedido', async () => {
    // saldo atual 500; resgata 500 no pedido x, que depois e entregue: base 10000 - 500 = 9500.
    const r = await chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: ped.x, valor: 500 })
    expect(r.statusCode).toBe(201)
    await poolSuper.query(`update public.pedidos set status = 'entregue' where id = $1`, [ped.x])
    const a = await chamar(atendA, lojaA, 'POST', '/acumular', { pedido_id: ped.x })
    expect(a.statusCode).toBe(201)
    expect(a.json().movimento.valor).toBe(475)
    expect(a.json().saldo).toBe(475)
  })

  it('concorrencia: dois resgates simultaneos com saldo para um so: um passa, outro 422', async () => {
    // saldo 475 (>= minimo 100): dois resgates de 300 em pedidos diferentes.
    const [r1, r2] = await Promise.all([
      chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: ped.n3, valor: 300 }),
      chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: ped.n4, valor: 300 }),
    ])
    const codigos = [r1.statusCode, r2.statusCode].sort()
    expect(codigos).toEqual([201, 422])
    const ruim = [r1, r2].find((r) => r.statusCode === 422)!
    expect(ruim.json().error.code).toBe('saldo_insuficiente')
    const s = (await chamar(atendA, lojaA, 'GET', `/clientes/${clienteA}/saldo`)).json()
    expect(s.saldo).toBe(175)
  })

  it('extrato: ordem decrescente, cursor, saldo_apos coerente e saldo derivado do livro', async () => {
    const p1 = (await chamar(atendA, lojaA, 'GET', `/clientes/${clienteA}/movimentos?limite=2`)).json()
    expect(p1.itens).toHaveLength(2)
    expect(p1.proximoCursor).toBeTruthy()
    const p2 = (await chamar(atendA, lojaA, 'GET', `/clientes/${clienteA}/movimentos?limite=2&cursor=${p1.proximoCursor}`)).json()
    const todos = [...p1.itens, ...p2.itens]
    expect(new Set(todos.map((m: { id: string }) => m.id)).size).toBe(todos.length)
    expect(todos[0].saldo_apos).toBe(175)
    const { rows } = await poolSuper.query<{ s: number }>(
      `select sum(case tipo when 'acumulo' then valor else -valor end)::int as s
         from public.fidelidade_movimentos where cliente_id = $1`, [clienteA])
    expect(rows[0]!.s).toBe(175)
    const ruim = await chamar(atendA, lojaA, 'GET', `/clientes/${clienteA}/movimentos?cursor=lixo`)
    expect(ruim.statusCode).toBe(400)
    expect(ruim.json().error.code).toBe('cursor_invalido')
  })

  it('teto revalidado na tx: subtotal que cai em paralelo barra o resgate acima do novo teto', async () => {
    // saldo de clienteA = 175 (cashback 1:1, minimo 100, max 50%). Pedido novo com subtotal alto.
    const pid = await pedido(lojaA, clienteA, 'A10', 'novo', 10000)
    const c = await poolSuper.connect()
    let resposta: Awaited<ReturnType<typeof chamar>>
    let confirmado = false
    try {
      await c.query('begin')
      // Simula o recalculo de totais (cancelar linha) baixando o subtotal e segurando a linha FOR UPDATE.
      await c.query('update public.pedidos set subtotal_centavos = 200, total_centavos = 200 where id = $1', [pid])
      // valor 150 caberia no subtotal antigo (teto 5000) mas estoura o teto do subtotal novo (100).
      const pendente = chamar(atendA, lojaA, 'POST', '/resgatar', { pedido_id: pid, valor: 150 })
      await new Promise((r) => setTimeout(r, 150)) // deixa o resgate bloquear no FOR UPDATE do pedido
      await c.query('commit')
      confirmado = true
      resposta = await pendente
    } finally {
      if (!confirmado) await c.query('rollback').catch(() => {})
      c.release()
    }
    expect(resposta.statusCode).toBe(422)
    expect(resposta.json().error.code).toBe('resgate_acima_do_limite')
    // saldo intacto: nada foi gravado.
    const s = (await chamar(atendA, lojaA, 'GET', `/clientes/${clienteA}/saldo`)).json()
    expect(s.saldo).toBe(175)
  })

  it('isolamento: outra loja nao ve saldo/extrato nem movimenta pedido alheio', async () => {
    await chamar(donoB, lojaB, 'PUT', '/programa', CASHBACK)
    expect((await chamar(donoB, lojaB, 'GET', `/clientes/${clienteA}/saldo`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'GET', `/clientes/${clienteA}/movimentos`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', '/acumular', { pedido_id: ped.e2 })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', '/resgatar', { pedido_id: ped.n2, valor: 100 })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaA, 'GET', '/programa')).statusCode).toBeGreaterThanOrEqual(403)
    expect((await chamar(donoB, lojaB, 'GET', '/programa')).json().cashback_bps).toBe(500)
  })

  it('modo travado apos o primeiro movimento; livre antes (modo pontos na loja B)', async () => {
    const travado = await chamar(donoA, lojaA, 'PUT', '/programa', { ...CASHBACK, modo: 'pontos' })
    expect(travado.statusCode).toBe(422)
    expect(travado.json().error.code).toBe('modo_travado')
    const livre = await chamar(donoB, lojaB, 'PUT', '/programa', {
      ...CASHBACK, modo: 'pontos', pontos_por_real: 2, valor_ponto_centavos: 5, minimo_resgate: 10,
    })
    expect(livre.statusCode).toBe(200)
    const a = (await chamar(donoB, lojaB, 'POST', '/acumular', { pedido_id: ped.b1 })).json()
    expect(a.movimento.valor).toBe(200) // 10000 / 100 * 2
    const s = (await chamar(donoB, lojaB, 'GET', `/clientes/${clienteB}/saldo`)).json()
    expect(s).toEqual({ cliente_id: clienteB, modo: 'pontos', saldo: 200, saldo_centavos: 1000 })
    const r = (await chamar(donoB, lojaB, 'POST', '/resgatar', { pedido_id: ped.b2, valor: 100 })).json()
    expect(r.desconto_centavos).toBe(500)
    expect(r.saldo).toBe(100)
  })

  it('programa inativo bloqueia acumulo e resgate', async () => {
    await chamar(donoB, lojaB, 'PUT', '/programa', {
      ...CASHBACK, modo: 'pontos', ativo: false, pontos_por_real: 2, valor_ponto_centavos: 5, minimo_resgate: 10,
    })
    const r = await chamar(donoB, lojaB, 'POST', '/resgatar', { pedido_id: ped.b2, valor: 10 })
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('programa_inativo')
  })

  it('resgate: entrada invalida (valor <= 0, campo extra) da 400', async () => {
    for (const body of [
      { pedido_id: ped.n2, valor: 0 },
      { pedido_id: ped.n2, valor: 1.5 },
      { pedido_id: ped.n2, valor: 100, loja_id: lojaB },
    ]) {
      const r = await chamar(donoA, lojaA, 'POST', '/resgatar', body)
      expect(r.statusCode).toBe(400)
      expect(r.json().error.code).toBe('entrada_invalida')
    }
  })

  it('livro append-only: api sem UPDATE/DELETE; trigger barra UPDATE ate do superusuario', async () => {
    const c = await poolApi.connect()
    try {
      await expect(c.query('update public.fidelidade_movimentos set valor = 1')).rejects.toThrow(/permission denied|permiss.o negada/)
      await expect(c.query('delete from public.fidelidade_movimentos')).rejects.toThrow(/permission denied|permiss.o negada/)
      await expect(c.query('delete from public.fidelidade_programas')).rejects.toThrow(/permission denied|permiss.o negada/)
    } finally {
      c.release()
    }
    await expect(poolSuper.query('update public.fidelidade_movimentos set valor = valor')).rejects.toThrow(/imutavel/)
  })

  it('constraints no banco: saldo negativo, valor zero, resgate sem desconto e unique por pedido', async () => {
    const ins = (tipo: string, valor: number, desc: number | null, saldo: number, pedidoId: string) =>
      poolSuper.query(
        `insert into public.fidelidade_movimentos (loja_id, cliente_id, pedido_id, tipo, valor, desconto_centavos, saldo_apos)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [lojaA, clienteA, pedidoId, tipo, valor, desc, saldo],
      )
    await expect(ins('acumulo', 10, null, -1, ped.n2!)).rejects.toThrow(/saldo_nao_negativo/)
    await expect(ins('acumulo', 0, null, 0, ped.n2!)).rejects.toThrow(/valor_positivo/)
    await expect(ins('resgate', 10, null, 0, ped.n2!)).rejects.toThrow(/fidelidade_movimentos_desconto/)
    await expect(ins('acumulo', 10, null, 10, ped.e1!)).rejects.toThrow(/fidelidade_movimentos_pedido_tipo/)
  })

  it('auditoria sem PII: eventos guardam ids e valores, nunca telefone', async () => {
    const { rows } = await poolSuper.query<{ t: string }>(
      `select detalhes::text as t from public.eventos where loja_id = $1 and tipo like 'fidelidade.%'`,
      [lojaA],
    )
    expect(rows.length).toBeGreaterThan(3)
    for (const l of rows) expect(l.t).not.toMatch(/telefone|\+55/)
  })
})
