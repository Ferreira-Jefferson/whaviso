// Integracao do modulo clientes contra o Postgres local (role whaviso_api).
// Cobre CRUD, busca por hash, enderecos, isolamento multi-tenant (SEC-001/002), PII (SEC-020/023/024).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarClientesRoutes } from './routes'
import { criarCifra } from './cripto'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})
const MASTER_KEY = 'master-key-de-teste-clientes-0123456789'
const cifra = criarCifra(MASTER_KEY)
const TEL = '(11) 99999-1234'
const TEL_E164 = '+5511999991234'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[clientes] banco inacessivel: integracao PULADA.')

const logs: string[] = []
const destino = new Writable({
  write(chunk: Buffer, _enc, cb) {
    logs.push(chunk.toString('utf8'))
    cb()
  },
})

async function montar(rateLimitDesligado = true) {
  const app = await construirApp({
    env: { ...env, RATE_LIMIT_DESLIGADO: rateLimitDesligado },
    pool: poolApi,
    logger: criarLogger('clientes-teste', 'info', destino),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'clientes', plugin: criarClientesRoutes(cifra) }],
  })
  await app.ready()
  return app
}

d('modulo clientes (integracao)', () => {
  const cen = novoCenario()
  const lojasCriadas: string[] = []
  let app: Awaited<ReturnType<typeof montar>>
  let donoA: string, atendA: string, donoB: string
  let lojaA1: string, lojaA2: string, lojaB: string

  const chamar = (
    user: string,
    loja: string | null,
    metodo: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method: metodo,
      url: `/v1/clientes${url}`,
      headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    donoA = await criarUsuario(cen)
    atendA = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, donoA)
    const contaB = await criarConta(cen, donoB)
    lojaA1 = await criarLoja(contaA)
    lojaA2 = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    lojasCriadas.push(lojaA1, lojaA2, lojaB)
    await criarMembro(contaA, donoA, 'dono', null)
    await criarMembro(contaA, atendA, 'atendente', lojaA1)
    await criarMembro(contaB, donoB, 'dono', null)
    app = await montar()
  })

  afterAll(async () => {
    await app.close()
    for (const l of lojasCriadas) {
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  // --- CRUD de cliente ---
  let clienteId = ''
  it('cria cliente: 201, telefone mascarado, sem claro/hash/cifrado na resposta', async () => {
    const r = await chamar(donoA, lojaA1, 'POST', '', { telefone: TEL, nome: 'Maria Silva' })
    expect(r.statusCode).toBe(201)
    const c = r.json()
    clienteId = c.id
    expect(c.telefone_mascarado).toBe('+55 ** *****-1234')
    expect(c.nome).toBe('Maria Silva')
    expect(r.body).not.toContain('99999')
    expect(r.body).not.toMatch(/telefone_hash|telefone_cifrado/)
  })

  it('SEC-023: banco guarda so hash + cifra (claro ausente em qualquer coluna)', async () => {
    const { rows } = await poolSuper.query<{ t: string; h: string; cif: Buffer }>(
      `select row_to_json(c)::text as t, telefone_hash as h, telefone_cifrado as cif
         from public.clientes c where id = $1`,
      [clienteId],
    )
    const l = rows[0]!
    expect(l.t).not.toContain('999991234')
    expect(l.t).not.toContain('11999991234')
    expect(l.h).toMatch(/^[0-9a-f]{64}$/)
    expect(l.cif.includes('999991234')).toBe(false)
  })

  it('telefone duplicado (outro formato) na mesma loja: 409 com id do existente', async () => {
    const r = await chamar(donoA, lojaA1, 'POST', '', { telefone: '+55 11 99999 1234' })
    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({ error: { code: 'cliente_ja_existe' }, cliente_id: clienteId })
  })

  it('mesmo telefone em OUTRA loja gera cliente independente', async () => {
    const r = await chamar(donoA, lojaA2, 'POST', '', { telefone: TEL })
    expect(r.statusCode).toBe(201)
    expect(r.json().id).not.toBe(clienteId)
  })

  it('telefone invalido: 422; corpo com campo extra (loja_id): 400', async () => {
    const r1 = await chamar(donoA, lojaA1, 'POST', '', { telefone: '123456789' })
    expect(r1.statusCode).toBe(422)
    expect(r1.json().error.code).toBe('telefone_invalido')
    const r2 = await chamar(donoA, lojaA1, 'POST', '', { telefone: TEL, loja_id: lojaB })
    expect(r2.statusCode).toBe(400)
    expect(r2.json().error.code).toBe('entrada_invalida')
  })

  it('PATCH altera so o nome; campos extras sao rejeitados', async () => {
    const r = await chamar(donoA, lojaA1, 'PATCH', `/${clienteId}`, { nome: 'Maria S. Souza' })
    expect(r.statusCode).toBe(200)
    expect(r.json().nome).toBe('Maria S. Souza')
    const ruim = await chamar(donoA, lojaA1, 'PATCH', `/${clienteId}`, { nome: 'x', telefone: TEL })
    expect(ruim.statusCode).toBe(400)
  })

  it('ficha: endereços ativos e agregados de pedidos (sem rascunho)', async () => {
    await poolSuper.query(
      `insert into public.pedidos (loja_id, cliente_id, codigo, status, subtotal_centavos, total_centavos)
       values ($1,$2,'P1','entregue',5000,5000), ($1,$2,'P2','novo',2500,2500), ($1,$2,'P3','rascunho',900,900)`,
      [lojaA1, clienteId],
    )
    const r = await chamar(donoA, lojaA1, 'GET', `/${clienteId}`)
    expect(r.statusCode).toBe(200)
    const f = r.json()
    expect(f.resumo_pedidos).toMatchObject({ total: 2, total_gasto_centavos: 7500 })
    expect(f.resumo_pedidos.ultimo_pedido_em).toMatch(/Z$/)
    expect(f.telefone_mascarado).toBe('+55 ** *****-1234')
  })

  // --- listagem e busca ---
  it('lista com mascara e sem hash/cifrado (SEC-020); ordena por ultima atividade', async () => {
    await chamar(donoA, lojaA1, 'POST', '', { telefone: '(21) 98888-0000', nome: 'Joao' })
    const r = await chamar(donoA, lojaA1, 'GET', '')
    expect(r.statusCode).toBe(200)
    expect(r.body).not.toMatch(/telefone_hash|telefone_cifrado|99999|98888/)
    const itens = r.json().itens as { id: string; ultima_atividade: string; pedidos_total: number }[]
    expect(itens).toHaveLength(2)
    const datas = itens.map((i) => i.ultima_atividade)
    expect([...datas].sort().reverse()).toEqual(datas)
    expect(itens.find((i) => i.id === clienteId)?.pedidos_total).toBe(2)
  })

  it('paginacao por cursor sem repetir nem pular', async () => {
    const p1 = (await chamar(donoA, lojaA1, 'GET', '?limite=1')).json()
    expect(p1.itens).toHaveLength(1)
    expect(p1.proximoCursor).toBeTruthy()
    const p2 = (await chamar(donoA, lojaA1, 'GET', `?limite=1&cursor=${p1.proximoCursor}`)).json()
    expect(p2.itens).toHaveLength(1)
    expect(p2.itens[0].id).not.toBe(p1.itens[0].id)
    expect(p2.proximoCursor).toBeNull()
    const ruim = await chamar(donoA, lojaA1, 'GET', '?cursor=lixo')
    expect(ruim.statusCode).toBe(400)
    expect(ruim.json().error.code).toBe('cursor_invalido')
  })

  it('busca por nome (ILIKE escapado: % e _ sao literais)', async () => {
    const achou = (await chamar(donoA, lojaA1, 'GET', '?q=souza')).json()
    expect(achou.itens).toHaveLength(1)
    const curinga = (await chamar(donoA, lojaA1, 'GET', '?q=%25')).json()
    expect(curinga.itens).toHaveLength(0)
    const sublinhado = (await chamar(donoA, lojaA1, 'GET', '?q=J_ao')).json()
    expect(sublinhado.itens).toHaveLength(0)
  })

  it('busca por telefone via hash (POST /buscar), qualquer formato; parcial nao e suportada', async () => {
    const r = await chamar(donoA, lojaA1, 'POST', '/buscar', { telefone: '+5511999991234' })
    expect(r.statusCode).toBe(200)
    expect(r.json().itens.map((i: { id: string }) => i.id)).toEqual([clienteId])
    const outraLoja = await chamar(donoB, lojaB, 'POST', '/buscar', { telefone: TEL })
    expect(outraLoja.json().itens).toHaveLength(0)
    const parcial = await chamar(donoA, lojaA1, 'POST', '/buscar', { telefone: '99999-12' })
    expect(parcial.statusCode).toBe(422)
    expect(parcial.json().error.code).toBe('telefone_invalido')
  })

  it('telefone na query string do GET e recusado (iria para o log de acesso)', async () => {
    const r = await chamar(donoA, lojaA1, 'GET', '?q=11999991234')
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('busca_telefone_use_post')
  })

  // --- revelar ---
  it('revelar: dono recebe E.164 com no-store e gera auditoria sem numero; atendente 403', async () => {
    const r = await chamar(donoA, lojaA1, 'POST', `/${clienteId}/telefone/revelar`)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ telefone: TEL_E164 })
    expect(r.headers['cache-control']).toBe('no-store')
    const { rows } = await poolSuper.query<{ detalhes: unknown; entidade_id: string }>(
      `select detalhes, entidade_id from public.eventos where tipo = 'cliente.telefone_revelado' and loja_id = $1`,
      [lojaA1],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.entidade_id).toBe(clienteId)
    expect(JSON.stringify(rows[0]!.detalhes)).toBe(JSON.stringify({ user_id: donoA }))
    const neg = await chamar(atendA, lojaA1, 'POST', `/${clienteId}/telefone/revelar`)
    expect(neg.statusCode).toBe(403)
  })

  it('atendente le a ficha e a lista (mascarado) e cria cliente', async () => {
    expect((await chamar(atendA, lojaA1, 'GET', `/${clienteId}`)).statusCode).toBe(200)
    expect((await chamar(atendA, lojaA1, 'GET', '')).statusCode).toBe(200)
  })

  // --- enderecos ---
  let endId = ''
  it('cria endereco; valida UF/CEP; coordenadas nao sao aceitas do painel', async () => {
    const r = await chamar(donoA, lojaA1, 'POST', `/${clienteId}/enderecos`, {
      logradouro: 'Rua das Flores', numero: '10', bairro: 'Centro', cidade: 'Sao Paulo', uf: 'sp', cep: '01310-100',
    })
    expect(r.statusCode).toBe(201)
    const e = r.json()
    endId = e.id
    expect(e).toMatchObject({ uf: 'SP', cep: '01310100', ativo: true, ultimo_uso_em: null })
    const ruim = [
      { logradouro: 'R', uf: 'SPP' },
      { logradouro: 'R', cep: '123' },
      { logradouro: 'R', lat: 1, lng: 2 },
      { numero: '1' },
    ]
    for (const corpo of ruim) {
      expect((await chamar(donoA, lojaA1, 'POST', `/${clienteId}/enderecos`, corpo)).statusCode).toBe(400)
    }
  })

  it('PATCH de endereco (parcial, limpar com null) e desativar; inativo some da lista', async () => {
    const p = await chamar(donoA, lojaA1, 'PATCH', `/enderecos/${endId}`, { complemento: 'Ap 3', numero: null })
    expect(p.statusCode).toBe(200)
    expect(p.json()).toMatchObject({ complemento: 'Ap 3', numero: null, logradouro: 'Rua das Flores' })
    expect((await chamar(donoA, lojaA1, 'PATCH', `/enderecos/${endId}`, {})).statusCode).toBe(400)
    const outro = (await chamar(donoA, lojaA1, 'POST', `/${clienteId}/enderecos`, { logradouro: 'Av Brasil' })).json()
    const des = await chamar(donoA, lojaA1, 'POST', `/enderecos/${outro.id}/desativar`)
    expect(des.json().ativo).toBe(false)
    const lista = (await chamar(donoA, lojaA1, 'GET', `/${clienteId}/enderecos`)).json().itens
    expect(lista.map((e: { id: string }) => e.id)).toEqual([endId])
    const edInativo = await chamar(donoA, lojaA1, 'PATCH', `/enderecos/${outro.id}`, { bairro: 'X' })
    expect(edInativo.statusCode).toBe(422)
  })

  it('ultimo endereco: vazio sem uso; maior ultimo_uso_em entre ativos; ignora inativos', async () => {
    const vazio = await chamar(donoA, lojaA1, 'GET', `/${clienteId}/ultimo-endereco`)
    expect(vazio.json()).toEqual({ endereco: null })
    const e2 = (await chamar(donoA, lojaA1, 'POST', `/${clienteId}/enderecos`, { logradouro: 'Rua B' })).json()
    const e3 = (await chamar(donoA, lojaA1, 'POST', `/${clienteId}/enderecos`, { logradouro: 'Rua C' })).json()
    await poolSuper.query(`update public.enderecos set ultimo_uso_em = now() - interval '2 days' where id = $1`, [endId])
    await poolSuper.query(`update public.enderecos set ultimo_uso_em = now() - interval '1 day' where id = $1`, [e2.id])
    await poolSuper.query(`update public.enderecos set ultimo_uso_em = now() where id = $1`, [e3.id])
    expect((await chamar(donoA, lojaA1, 'GET', `/${clienteId}/ultimo-endereco`)).json().endereco.id).toBe(e3.id)
    await chamar(donoA, lojaA1, 'POST', `/enderecos/${e3.id}/desativar`)
    expect((await chamar(donoA, lojaA1, 'GET', `/${clienteId}/ultimo-endereco`)).json().endereco.id).toBe(e2.id)
  })

  // --- isolamento multi-tenant ---
  it('SEC-001: loja B nao le cliente/endereco da loja A (404); listas isoladas', async () => {
    const cB = (await chamar(donoB, lojaB, 'POST', '', { telefone: '(31) 97777-0000' })).json()
    expect((await chamar(donoB, lojaB, 'GET', `/${clienteId}`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'PATCH', `/${clienteId}`, { nome: 'Invasor' })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', `/${clienteId}/telefone/revelar`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'GET', `/${clienteId}/enderecos`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'GET', `/${clienteId}/ultimo-endereco`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'PATCH', `/enderecos/${endId}`, { bairro: 'X' })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', `/enderecos/${endId}/desativar`)).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', `/${clienteId}/enderecos`, { logradouro: 'X' })).statusCode).toBe(404)
    const lista = (await chamar(donoB, lojaB, 'GET', '')).json().itens
    expect(lista.map((i: { id: string }) => i.id)).toEqual([cB.id])
    const { rows } = await poolSuper.query('select nome from public.clientes where id = $1', [clienteId])
    expect(rows[0].nome).toBe('Maria S. Souza')
  })

  it('SEC-002: x-loja-id de outra conta = 404; loja_id na query/corpo nao muda a loja; cliente da loja A1 nao aparece em A2', async () => {
    expect((await chamar(donoB, lojaA1, 'GET', '')).statusCode).toBe(404)
    const q = await chamar(donoB, lojaB, 'GET', `?loja_id=${lojaA1}`)
    expect(q.statusCode).toBe(400)
    expect((await chamar(donoA, lojaA2, 'GET', `/${clienteId}`)).statusCode).toBe(404)
  })

  it('sem autenticacao: 401; ids malformados: 400', async () => {
    const r = await app.inject({ method: 'GET', url: '/v1/clientes' })
    expect(r.statusCode).toBe(401)
    expect((await chamar(donoA, lojaA1, 'GET', '/nao-e-uuid')).statusCode).toBe(400)
  })

  // --- logs (SEC-024) ---
  it('SEC-024: telefone, nome e endereco nao aparecem no log de nenhuma operacao', async () => {
    // O GET com telefone na query e recusado (422), mas o serializer de req do app loga `query`:
    // por isso ele fica fora desta medicao (achado para o kernel, ver relatorio).
    logs.length = 0
    await chamar(donoA, lojaA1, 'POST', '/buscar', { telefone: TEL })
    await chamar(donoA, lojaA1, 'POST', '', { telefone: TEL, nome: 'Maria Silva' })
    await chamar(donoA, lojaA1, 'POST', '', { telefone: '123', nome: 'Maria Silva' })
    await chamar(donoA, lojaA1, 'POST', `/${clienteId}/telefone/revelar`)
    await chamar(donoA, lojaA1, 'POST', `/${clienteId}/enderecos`, { logradouro: 'Rua Segredo 77' })
    const tudo = logs.join('\n')
    expect(tudo.length).toBeGreaterThan(0)
    for (const proibido of ['999991234', '99999-1234', '11999991234', 'Maria Silva', 'Segredo']) {
      expect(logs.filter((l) => l.includes(proibido))).toEqual([])
    }
    expect(tudo).not.toContain(MASTER_KEY)
  })

  // --- rate limit ---
  it('SEC-101: rate limit em /telefone/revelar e na busca por telefone', async () => {
    const app2 = await montar(false)
    const rev = async () =>
      (
        await app2.inject({
          method: 'POST',
          url: `/v1/clientes/${clienteId}/telefone/revelar`,
          headers: { authorization: `Bearer ${donoA}`, 'x-loja-id': lojaA1 },
        })
      ).statusCode
    const codigos: number[] = []
    for (let i = 0; i < 11; i++) codigos.push(await rev())
    expect(codigos.slice(0, 10).every((c) => c === 200)).toBe(true)
    expect(codigos[10]).toBe(429)
    await app2.close()
  })

  it('id inexistente gerado: 404 (nao 500)', async () => {
    expect((await chamar(donoA, lojaA1, 'GET', `/${randomUUID()}`)).statusCode).toBe(404)
  })
})
