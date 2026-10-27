// Integração + segurança do módulo pagamentos. Roda no Postgres LOCAL (whaviso_dev via
// PGDATABASE do .env.test). Pula com aviso se o banco não estiver acessível. Mesmo molde do
// harness de numeros_whatsapp (pools próprios + SET ROLE para a matriz de privilégio).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'
import { validarBrCode } from '@whaviso/shared/contracts'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { verificadorFake } from '../../../test/app'
import { criarCripto } from './cripto'
import { criarRotasPagamentos } from './routes'

const HOST = process.env.PGHOST ?? '127.0.0.1'
const DB = process.env.PGDATABASE ?? 'whaviso_dev'

// Senha do superusuário lida da fonte canônica backend/.env (só para o DB LOCAL de teste).
function senhaSuper(): string {
  try {
    const aqui = dirname(fileURLToPath(import.meta.url))
    const txt = readFileSync(resolve(aqui, '../../../../../.env'), 'utf8')
    for (const linha of txt.split('\n')) {
      const m = /^\s*POSTGRES_PASSWORD\s*=\s*(.*)\s*$/.exec(linha)
      if (m) return m[1]!.replace(/^["']|["']$/g, '').trim()
    }
  } catch {
    /* sem .env: cai no process.env/default */
  }
  return process.env.POSTGRES_PASSWORD ?? 'postgres'
}

const poolApi = new pg.Pool({
  host: HOST,
  port: 5432,
  user: 'whaviso_api',
  password: 'whaviso_api_dev',
  database: DB,
  max: 3,
})
const poolSuper = new pg.Pool({
  host: HOST,
  port: 5432,
  user: 'postgres',
  password: senhaSuper(),
  database: DB,
  max: 3,
})

async function bancoAcessivel(): Promise<boolean> {
  try {
    await poolApi.query('select 1')
    await poolSuper.query('select 1')
    // O teste exige a coluna ultimos4 (migration 0032). Se o DB não a tiver, pula com aviso.
    const { rows } = await poolSuper.query(
      "select 1 from information_schema.columns where table_schema='public' and table_name='loja_pix' and column_name='ultimos4'",
    )
    return rows.length === 1
  } catch {
    return false
  }
}
async function fecharPools(): Promise<void> {
  await poolApi.end().catch(() => {})
  await poolSuper.end().catch(() => {})
}

interface Cenario {
  usuarios: string[]
  contas: string[]
}
function novoCenario(): Cenario {
  return { usuarios: [], contas: [] }
}
async function criarUsuario(c: Cenario): Promise<string> {
  const id = randomUUID()
  await poolSuper.query('insert into auth.users (id) values ($1)', [id])
  c.usuarios.push(id)
  return id
}
async function criarConta(c: Cenario, donoUserId: string): Promise<string> {
  const id = randomUUID()
  await poolSuper.query('insert into public.contas (id, dono_user_id, nome) values ($1,$2,$3)', [
    id,
    donoUserId,
    'Conta de teste',
  ])
  c.contas.push(id)
  return id
}
async function criarLoja(contaId: string): Promise<string> {
  const id = randomUUID()
  await poolSuper.query('insert into public.lojas (id, conta_id, nome, ativo) values ($1,$2,$3,true)', [
    id,
    contaId,
    'Loja de teste',
  ])
  return id
}
async function criarMembro(
  contaId: string,
  userId: string,
  papel: 'dono' | 'gerente' | 'atendente',
  lojaId: string,
): Promise<void> {
  await poolSuper.query(
    'insert into public.membros (conta_id, loja_id, user_id, papel, ativo) values ($1,$2,$3,$4,true)',
    [contaId, lojaId, userId, papel],
  )
}
async function criarPedido(lojaId: string, totalCentavos: number): Promise<string> {
  const id = randomUUID()
  const codigo = 'P' + id.slice(0, 6).toUpperCase()
  await poolSuper.query(
    `insert into public.pedidos (id, loja_id, codigo, status, subtotal_centavos, taxa_entrega_centavos, total_centavos)
     values ($1,$2,$3,'novo',$4,0,$4)`,
    [id, lojaId, codigo, totalCentavos],
  )
  return id
}
async function limpar(c: Cenario): Promise<void> {
  for (const contaId of c.contas) {
    await poolSuper.query('delete from public.contas where id=$1', [contaId]).catch(() => {})
  }
  for (const userId of c.usuarios) {
    await poolSuper.query('delete from auth.users where id=$1', [userId]).catch(() => {})
  }
}

const MASTER_KEY = 'master-key-de-teste-pagamentos-integra-0123456789'
const cripto = criarCripto(MASTER_KEY)

let disponivel = false

const env = envSchema.parse({
  DATABASE_URL: `postgresql://whaviso_api:whaviso_api_dev@${HOST}:5432/${DB}`,
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  MASTER_KEY,
  RATE_LIMIT_DESLIGADO: 'true',
})

async function montarApp(logger: Parameters<typeof construirApp>[0]['logger'] = false) {
  return construirApp({
    env,
    pool: poolApi,
    logger,
    verificador: verificadorFake,
    modulos: [{ prefixo: 'pagamentos', plugin: criarRotasPagamentos({ cripto }) }],
  })
}

const SET_ROLE = {
  whaviso_api: 'set role whaviso_api',
  whaviso_zap: 'set role whaviso_zap',
  whaviso_atendente: 'set role whaviso_atendente',
} as const

async function sobRole<T>(
  role: keyof typeof SET_ROLE,
  fn: (q: typeof poolSuper.query) => Promise<T>,
): Promise<T> {
  const c = await poolSuper.connect()
  try {
    await c.query(SET_ROLE[role])
    return await fn(c.query.bind(c) as typeof poolSuper.query)
  } finally {
    await c.query('reset role').catch(() => {})
    c.release()
  }
}

interface Fixtura {
  cenario: Cenario
  userId: string
  lojaId: string
}
async function seedLojaComMembro(papel: 'dono' | 'gerente' | 'atendente'): Promise<Fixtura> {
  const cenario = novoCenario()
  const userId = await criarUsuario(cenario)
  const contaId = await criarConta(cenario, userId)
  const lojaId = await criarLoja(contaId)
  await criarMembro(contaId, userId, papel, lojaId)
  return { cenario, userId, lojaId }
}
const auth = (userId: string, lojaId: string) => ({
  authorization: `Bearer ${userId}`,
  'x-loja-id': lojaId,
})

beforeAll(async () => {
  disponivel = await bancoAcessivel()
  if (!disponivel) console.warn('[pagamentos] banco/coluna indisponivel: testes de integracao pulados')
})
afterAll(fecharPools)

const cenarios: Cenario[] = []
afterEach(async () => {
  for (const c of cenarios.splice(0)) await limpar(c)
})
function registrar(f: Fixtura): Fixtura {
  cenarios.push(f.cenario)
  return f
}

const pixEntrada = {
  tipo: 'aleatoria' as const,
  chave: '123e4567-e12b-12d1-a456-426655440000',
  titular: 'Loja do Teste',
  cidade: 'São Paulo',
}

describe('PUT/GET /pagamentos/pix (chave da loja)', () => {
  it('grava a chave e GET devolve só metadado, sem a chave em claro (SEC-020)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    const h = auth(f.userId, f.lojaId)
    const put = await app.inject({ method: 'PUT', url: '/v1/pagamentos/pix', headers: h, payload: pixEntrada })
    expect(put.statusCode).toBe(200)
    const estado = put.json().pix
    expect(estado).toMatchObject({ loja_id: f.lojaId, tipo: 'aleatoria', titular: 'Loja do Teste', cidade: 'São Paulo' })
    expect(estado.ultimos4).toBe(pixEntrada.chave.slice(-4))
    expect(put.body).not.toContain(pixEntrada.chave) // chave inteira nunca na resposta

    const get = await app.inject({ method: 'GET', url: '/v1/pagamentos/pix', headers: h })
    await app.close()
    expect(get.statusCode).toBe(200)
    expect(get.body).not.toContain(pixEntrada.chave)
    expect(get.json().pix.ultimos4).toBe(pixEntrada.chave.slice(-4))
  })

  it('cifra em repouso: a linha guarda hash+cifra; a cifra decifra e os bytes não têm a chave (SEC-023)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    await app.inject({
      method: 'PUT',
      url: '/v1/pagamentos/pix',
      headers: auth(f.userId, f.lojaId),
      payload: { tipo: 'aleatoria', chave: '123e4567-e12b-12d1-a456-426655440000', titular: 'T' },
    })
    await app.close()
    const { rows } = await poolApi.query(
      'select chave_hash, chave_cifrada from public.loja_pix where loja_id=$1',
      [f.lojaId],
    )
    const chave = '123e4567-e12b-12d1-a456-426655440000'
    expect(rows[0].chave_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0].chave_hash).not.toContain(chave)
    const cifrada = rows[0].chave_cifrada as Buffer
    expect(cripto.decifrar(cifrada)).toBe(chave)
    expect(cifrada.toString('utf8')).not.toContain(chave)
    expect(cifrada.toString('latin1')).not.toContain(chave)
  })

  it('loja_id forjado no corpo é rejeitado (SEC-002, strict)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/pagamentos/pix',
      headers: auth(f.userId, f.lojaId),
      payload: { ...pixEntrada, loja_id: f.lojaId },
    })
    await app.close()
    expect(res.statusCode).toBe(400)
  })

  it('atendente NÃO cadastra a chave (403, loja:gerir)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('atendente'))
    const app = await montarApp()
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/pagamentos/pix',
      headers: auth(f.userId, f.lojaId),
      payload: pixEntrada,
    })
    await app.close()
    expect(res.statusCode).toBe(403)
  })
})

async function definirPix(app: Awaited<ReturnType<typeof montarApp>>, h: Record<string, string>): Promise<void> {
  const r = await app.inject({ method: 'PUT', url: '/v1/pagamentos/pix', headers: h, payload: pixEntrada })
  expect(r.statusCode).toBe(200)
}

describe('POST /pagamentos/pedidos/:pedidoId (criar cobrança)', () => {
  it('gera BR Code válido, pendente, valor do pedido, e é idempotente', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    const h = auth(f.userId, f.lojaId)
    await definirPix(app, h)
    const pedidoId = await criarPedido(f.lojaId, 4599)

    const r1 = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedidoId}`, headers: h, payload: {} })
    expect(r1.statusCode).toBe(201)
    const pag = r1.json()
    expect(pag).toMatchObject({ pedido_id: pedidoId, loja_id: f.lojaId, status: 'pendente', valor_centavos: 4599 })
    expect(pag.txid).toBeTruthy()
    expect(validarBrCode(pag.br_code)).toBe(true)
    expect(pag.expira_em).toBeTruthy()

    // Idempotência: segunda criação reusa a mesma cobrança pendente.
    const r2 = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedidoId}`, headers: h, payload: {} })
    await app.close()
    expect([200, 201]).toContain(r2.statusCode)
    expect(r2.json().id).toBe(pag.id)
  })

  it('sem chave Pix cadastrada: 422 pix_nao_configurado', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    const pedidoId = await criarPedido(f.lojaId, 1000)
    const res = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedidoId}`, headers: auth(f.userId, f.lojaId), payload: {} })
    await app.close()
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('pix_nao_configurado')
  })

  it('pedido de outra loja: 404 (SEC-001)', async () => {
    if (!disponivel) return
    const a = registrar(await seedLojaComMembro('dono'))
    const b = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    await definirPix(app, auth(a.userId, a.lojaId))
    const pedidoB = await criarPedido(b.lojaId, 1000)
    const res = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedidoB}`, headers: auth(a.userId, a.lojaId), payload: {} })
    await app.close()
    expect(res.statusCode).toBe(404)
  })

  it('pedido sem total (0): 422 pedido_sem_total', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    const h = auth(f.userId, f.lojaId)
    await definirPix(app, h)
    const pedidoId = await criarPedido(f.lojaId, 0)
    const res = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedidoId}`, headers: h, payload: {} })
    await app.close()
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('pedido_sem_total')
  })
})

describe('conciliação / cancelamento / expiração', () => {
  async function criarCobranca(app: Awaited<ReturnType<typeof montarApp>>, h: Record<string, string>, lojaId: string, total = 2500) {
    await definirPix(app, h)
    const pedidoId = await criarPedido(lojaId, total)
    const r = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedidoId}`, headers: h, payload: {} })
    expect(r.statusCode).toBe(201)
    return r.json()
  }

  it('pendente -> pago; conciliar de novo é no-op (idempotente)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    const h = auth(f.userId, f.lojaId)
    const pag = await criarCobranca(app, h, f.lojaId)
    const c1 = await app.inject({ method: 'POST', url: `/v1/pagamentos/${pag.id}/conciliar`, headers: h, payload: {} })
    expect(c1.statusCode).toBe(200)
    expect(c1.json()).toMatchObject({ status: 'pago' })
    expect(c1.json().pago_em).toBeTruthy()
    const c2 = await app.inject({ method: 'POST', url: `/v1/pagamentos/${pag.id}/conciliar`, headers: h, payload: {} })
    await app.close()
    expect(c2.statusCode).toBe(200)
    expect(c2.json()).toMatchObject({ status: 'pago', id: pag.id })
  })

  it('pago não pode ser cancelado (409 transicao_invalida)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    const h = auth(f.userId, f.lojaId)
    const pag = await criarCobranca(app, h, f.lojaId)
    await app.inject({ method: 'POST', url: `/v1/pagamentos/${pag.id}/conciliar`, headers: h, payload: {} })
    const cancel = await app.inject({ method: 'POST', url: `/v1/pagamentos/${pag.id}/cancelar`, headers: h })
    await app.close()
    expect(cancel.statusCode).toBe(409)
    expect(cancel.json().error.code).toBe('transicao_invalida')
  })

  it('cancelar uma pendente; cancelar de novo é no-op', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('gerente'))
    const app = await montarApp()
    const h = auth(f.userId, f.lojaId)
    const pag = await criarCobranca(app, h, f.lojaId)
    const x1 = await app.inject({ method: 'POST', url: `/v1/pagamentos/${pag.id}/cancelar`, headers: h })
    expect(x1.json()).toMatchObject({ status: 'cancelado' })
    const x2 = await app.inject({ method: 'POST', url: `/v1/pagamentos/${pag.id}/cancelar`, headers: h })
    await app.close()
    expect(x2.statusCode).toBe(200)
    expect(x2.json().status).toBe('cancelado')
  })

  it('expiração preguiçosa: vencida vira expirado na leitura e não pode ser conciliada', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    const h = auth(f.userId, f.lojaId)
    const pag = await criarCobranca(app, h, f.lojaId)
    // Força o vencimento no passado (como se 30 min tivessem passado).
    await poolSuper.query("update public.pagamentos set expira_em = now() - interval '1 minute' where id=$1", [pag.id])
    const det = await app.inject({ method: 'GET', url: `/v1/pagamentos/${pag.id}`, headers: h })
    expect(det.json().status).toBe('expirado')
    const conc = await app.inject({ method: 'POST', url: `/v1/pagamentos/${pag.id}/conciliar`, headers: h, payload: {} })
    await app.close()
    expect(conc.statusCode).toBe(409)
  })

  it('listagem filtra por status e por pedido, isolada por loja', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp()
    const h = auth(f.userId, f.lojaId)
    const pag = await criarCobranca(app, h, f.lojaId)
    const lista = await app.inject({ method: 'GET', url: `/v1/pagamentos?pedido_id=${pag.pedido_id}&status=pendente`, headers: h })
    await app.close()
    expect(lista.statusCode).toBe(200)
    const ids = lista.json().pagamentos.map((p: { id: string }) => p.id)
    expect(ids).toContain(pag.id)
  })
})

describe('matriz de privilégio por SET ROLE (SEC-030/032)', () => {
  it('SEC-032: whaviso_atendente lê pagamentos mas NÃO a chave Pix (loja_pix.chave_cifrada)', async () => {
    if (!disponivel) return
    // atendente tem select em pagamentos (grant 0008).
    await expect(
      sobRole('whaviso_atendente', (q) => q('select id, status from public.pagamentos limit 1')),
    ).resolves.toBeDefined()
    // atendente NÃO tem grant na chave Pix hoje (BR Code em conversa ainda não habilitado).
    await expect(
      sobRole('whaviso_atendente', (q) => q('select chave_cifrada from public.loja_pix limit 1')),
    ).rejects.toThrow()
  })

  it('SEC-030: whaviso_api NÃO tem DELETE em pagamentos nem em loja_pix', async () => {
    if (!disponivel) return
    await expect(
      sobRole('whaviso_api', (q) => q('delete from public.pagamentos where id is null')),
    ).rejects.toThrow()
    await expect(
      sobRole('whaviso_api', (q) => q('delete from public.loja_pix where loja_id is null')),
    ).rejects.toThrow()
  })
})

describe('SEC-024: a chave Pix nunca entra em log', () => {
  it('a saída de log (com redaction) não contém a chave cadastrada', async () => {
    if (!disponivel) return
    const { criarLogger } = await import('@whaviso/shared/logger')
    const linhas: string[] = []
    const logger = criarLogger('pagamentos-test', 'info', { write: (s: string) => void linhas.push(s) })
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(logger)
    await app.inject({
      method: 'PUT',
      url: '/v1/pagamentos/pix',
      headers: auth(f.userId, f.lojaId),
      payload: { tipo: 'aleatoria', chave: '123e4567-e12b-12d1-a456-426655440000', titular: 'Fulano Sensivel' },
    })
    await app.close()
    const todo = linhas.join('')
    expect(todo).not.toContain('123e4567-e12b-12d1-a456-426655440000')
  })

  it('SEC-101: rate limit no PUT /pagamentos/pix (teto da rota sensível)', async () => {
    if (!disponivel) return
    // O teto por rota (`config.rateLimit`) vale mesmo com o rate limit global desligado.
    const app = await montarApp()
    const f = registrar(await seedLojaComMembro('dono'))
    const h = auth(f.userId, f.lojaId)
    let viu429 = false
    for (let i = 0; i < 7; i++) {
      const res = await app.inject({ method: 'PUT', url: '/v1/pagamentos/pix', headers: h, payload: pixEntrada })
      if (res.statusCode === 429) viu429 = true
    }
    await app.close()
    expect(viu429).toBe(true)
  })
})
