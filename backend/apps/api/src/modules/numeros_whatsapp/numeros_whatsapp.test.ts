// Integracao + seguranca do modulo numeros_whatsapp. Roda no Postgres LOCAL (banco por worker,
// ver backend/test-support). Pula com aviso se o banco nao estiver acessivel.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { verificadorFake } from '../../../test/app'
import { criarCripto } from './cripto'
import { criarRotasNumeros } from './routes'
import { ErroMeta, type MetaOnboarding } from './meta_onboarding'
import { criarPool, criarPoolSuper, bancoDoWorker, HOST } from '../../../../../test-support/banco'

const poolApi = criarPool('whaviso_api', 'whaviso_api_dev', 3)
const poolSuper = criarPoolSuper(3)

async function bancoAcessivel(): Promise<boolean> {
  try {
    await poolApi.query('select 1')
    await poolSuper.query('select 1')
    return true
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
async function limpar(c: Cenario): Promise<void> {
  for (const contaId of c.contas) {
    await poolSuper.query('delete from public.contas where id=$1', [contaId]).catch(() => {})
  }
  for (const userId of c.usuarios) {
    await poolSuper.query('delete from auth.users where id=$1', [userId]).catch(() => {})
  }
}
const MASTER_KEY = 'master-key-de-teste-numeros-integra-0123456789'
const cripto = criarCripto(MASTER_KEY)
const TOKEN = 'META_TOKEN_SECRETO_para_round_trip_e_dump'
const NUMERO = '+5511988887777'

let disponivel = false

const env = envSchema.parse({
  DATABASE_URL: `postgresql://whaviso_api:whaviso_api_dev@${HOST}:5432/${bancoDoWorker()}`,
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  MASTER_KEY,
  RATE_LIMIT_DESLIGADO: 'true',
})

function stubOk(token = TOKEN, verificado = true): MetaOnboarding {
  return {
    trocarCodigo: async () => ({ token }),
    lerTelefone: async () => ({ numero_e164: NUMERO, verificado }),
    assinarWebhook: async () => {},
  }
}
const stubFalha: MetaOnboarding = {
  trocarCodigo: async () => {
    throw new ErroMeta('code invalido')
  },
  lerTelefone: async () => ({ numero_e164: NUMERO, verificado: true }),
  assinarWebhook: async () => {},
}

async function montarApp(
  onboarding: MetaOnboarding,
  logger: Parameters<typeof construirApp>[0]['logger'] = false,
) {
  return construirApp({
    env,
    pool: poolApi,
    logger,
    verificador: verificadorFake,
    modulos: [{ prefixo: 'numeros', plugin: criarRotasNumeros({ onboarding, cripto }) }],
  })
}

// Statements de SET ROLE como literais fixos (sem interpolacao; SEC-080).
const SET_ROLE = {
  whaviso_zap: 'set role whaviso_zap',
  whaviso_atendente: 'set role whaviso_atendente',
} as const

/** Executa um bloco sob um role de servico (SET ROLE), sempre com RESET depois. */
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
  if (!disponivel) console.warn('[numeros_whatsapp] banco indisponivel: testes de integracao pulados')
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

describe('POST /numeros (conectar via Embedded Signup)', () => {
  it('conecta, grava hash+cifra e responde SEM token nem numero (SEC-020)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(stubOk())
    const res = await app.inject({
      method: 'POST',
      url: '/v1/numeros',
      headers: auth(f.userId, f.lojaId),
      payload: { codigo: 'code-es-123', waba_id: 'WABA1', phone_number_id: 'PN1' },
    })
    await app.close()
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({ loja_id: f.lojaId, phone_number_id: 'PN1', verificado: true, status: 'conectado' })
    // Nenhum vazamento de segredo na resposta (texto cru).
    expect(res.body).not.toContain(TOKEN)
    expect(res.body).not.toContain(NUMERO)
    expect(res.body.toLowerCase()).not.toContain('token')
  })

  it('phone_number_id duplicado => 409 sem revelar a loja', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(stubOk())
    const payload = { codigo: 'c', waba_id: 'W', phone_number_id: 'PN_DUP' }
    const h = auth(f.userId, f.lojaId)
    const r1 = await app.inject({ method: 'POST', url: '/v1/numeros', headers: h, payload })
    const r2 = await app.inject({ method: 'POST', url: '/v1/numeros', headers: h, payload })
    await app.close()
    expect(r1.statusCode).toBe(201)
    expect(r2.statusCode).toBe(409)
    expect(r2.json().error.code).toBe('conflito')
    expect(r2.body).not.toContain(f.lojaId)
  })

  it('falha da Meta NAO grava registro parcial (502, zero linhas)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(stubFalha)
    const res = await app.inject({
      method: 'POST',
      url: '/v1/numeros',
      headers: auth(f.userId, f.lojaId),
      payload: { codigo: 'ruim', waba_id: 'W', phone_number_id: 'PN_FALHA' },
    })
    await app.close()
    expect(res.statusCode).toBe(502)
    const { rows } = await poolApi.query(
      'select count(*)::int n from public.numeros_whatsapp where loja_id=$1',
      [f.lojaId],
    )
    expect(rows[0].n).toBe(0)
  })

  it('atendente NAO conecta (403)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('atendente'))
    const app = await montarApp(stubOk())
    const res = await app.inject({
      method: 'POST',
      url: '/v1/numeros',
      headers: auth(f.userId, f.lojaId),
      payload: { codigo: 'c', waba_id: 'W', phone_number_id: 'PN_AT' },
    })
    await app.close()
    expect(res.statusCode).toBe(403)
  })

  it('loja_id no corpo e rejeitado (SEC-002, strictObject)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(stubOk())
    const res = await app.inject({
      method: 'POST',
      url: '/v1/numeros',
      headers: auth(f.userId, f.lojaId),
      payload: { codigo: 'c', waba_id: 'W', phone_number_id: 'PN', loja_id: f.lojaId },
    })
    await app.close()
    expect(res.statusCode).toBe(400)
  })
})

describe('isolamento multi-tenant (SEC-001)', () => {
  it('loja de outra conta no header => 404', async () => {
    if (!disponivel) return
    const a = registrar(await seedLojaComMembro('dono'))
    const b = registrar(await seedLojaComMembro('dono')) // outra conta/loja
    const app = await montarApp(stubOk())
    const res = await app.inject({
      method: 'GET',
      url: '/v1/numeros',
      headers: auth(a.userId, b.lojaId), // user de A pedindo loja de B
    })
    await app.close()
    expect(res.statusCode).toBe(404)
  })
})

describe('listar / detalhar / status / reconectar', () => {
  it('fluxo completo e detalhe isolado por loja', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('gerente'))
    const app = await montarApp(stubOk())
    const h = auth(f.userId, f.lojaId)
    const criado = (
      await app.inject({ method: 'POST', url: '/v1/numeros', headers: h, payload: { codigo: 'c', waba_id: 'W', phone_number_id: 'PNx' } })
    ).json()

    const lista = await app.inject({ method: 'GET', url: '/v1/numeros', headers: h })
    expect(lista.json().numeros).toHaveLength(1)

    const det = await app.inject({ method: 'GET', url: `/v1/numeros/${criado.id}`, headers: h })
    expect(det.statusCode).toBe(200)
    expect(det.body).not.toContain('token')

    const pausa = await app.inject({ method: 'PATCH', url: `/v1/numeros/${criado.id}/status`, headers: h, payload: { acao: 'pausar' } })
    expect(pausa.json().status).toBe('pausado')

    const reat = await app.inject({ method: 'PATCH', url: `/v1/numeros/${criado.id}/status`, headers: h, payload: { acao: 'reativar' } })
    expect(reat.json().status).toBe('conectado')

    const recon = await app.inject({ method: 'POST', url: `/v1/numeros/${criado.id}/reconectar`, headers: h, payload: { codigo: 'novo-code' } })
    expect(recon.statusCode).toBe(200)
    expect(recon.body).not.toContain(TOKEN)

    const remove = await app.inject({ method: 'PATCH', url: `/v1/numeros/${criado.id}/status`, headers: h, payload: { acao: 'remover' } })
    expect(remove.json().status).toBe('removido')
    await app.close()

    // remover zerou o token_cifrado (segredo nao permanece apos desconexao).
    const { rows } = await poolApi.query('select token_cifrado from public.numeros_whatsapp where id=$1', [criado.id])
    expect(rows[0].token_cifrado).toBeNull()
  })

  it('detalhe de id inexistente => 404', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(stubOk())
    const res = await app.inject({
      method: 'GET',
      url: '/v1/numeros/00000000-0000-0000-0000-000000000000',
      headers: auth(f.userId, f.lojaId),
    })
    await app.close()
    expect(res.statusCode).toBe(404)
  })
})

describe('segredo do token: round trip, cifra em repouso e matriz de roles', () => {
  it('round trip zap: le token_cifrado e decifra (SEC-022 zap le) / SEC-023 cifra em repouso', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(stubOk())
    const criado = (
      await app.inject({ method: 'POST', url: '/v1/numeros', headers: auth(f.userId, f.lojaId), payload: { codigo: 'c', waba_id: 'W', phone_number_id: 'PN_RT' } })
    ).json()
    await app.close()

    // zap (role real) LE a coluna do segredo e decifra com a mesma master key.
    const cifrado = await sobRole('whaviso_zap', async (q) => {
      const { rows } = await q('select token_cifrado from public.numeros_whatsapp where id=$1', [criado.id])
      return rows[0].token_cifrado as Buffer
    })
    expect(cripto.decifrar(cifrado)).toBe(TOKEN)
    // SEC-023: o bytes em repouso nao contem o texto claro.
    expect(cifrado.toString('utf8')).not.toContain(TOKEN)
    expect(cifrado.toString('latin1')).not.toContain(TOKEN)
  })

  it('SEC-022: whaviso_atendente NAO le token_cifrado (grant por coluna)', async () => {
    if (!disponivel) return
    await expect(
      sobRole('whaviso_atendente', (q) => q('select token_cifrado from public.numeros_whatsapp limit 1')),
    ).rejects.toThrow()
    // mas le as colunas publicas
    await expect(
      sobRole('whaviso_atendente', (q) => q('select id, status from public.numeros_whatsapp limit 1')),
    ).resolves.toBeDefined()
  })

  it('SEC-031: whaviso_zap escreve status mas NAO token_cifrado nem numero_hash', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(stubOk())
    const criado = (
      await app.inject({ method: 'POST', url: '/v1/numeros', headers: auth(f.userId, f.lojaId), payload: { codigo: 'c', waba_id: 'W', phone_number_id: 'PN_ZAP' } })
    ).json()
    await app.close()

    await expect(
      sobRole('whaviso_zap', (q) => q("update public.numeros_whatsapp set status='pausado' where id=$1", [criado.id])),
    ).resolves.toBeDefined()
    await expect(
      sobRole('whaviso_zap', (q) => q('update public.numeros_whatsapp set token_cifrado=null where id=$1', [criado.id])),
    ).rejects.toThrow()
    await expect(
      sobRole('whaviso_zap', (q) => q("update public.numeros_whatsapp set numero_hash='x' where id=$1", [criado.id])),
    ).rejects.toThrow()
  })
})

describe('SEC-024: token e codigo nunca entram em log', () => {
  it('a saida de log (com redaction) nao contem token nem codigo', async () => {
    if (!disponivel) return
    const { criarLogger } = await import('@whaviso/shared/logger')
    const linhas: string[] = []
    const logger = criarLogger('numeros-test', 'info', { write: (s: string) => void linhas.push(s) })
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(stubOk(), logger)
    await app.inject({
      method: 'POST',
      url: '/v1/numeros',
      headers: auth(f.userId, f.lojaId),
      payload: { codigo: 'CODIGO_SECRETO_ES', waba_id: 'W', phone_number_id: 'PN_LOG' },
    })
    await app.close()
    const todo = linhas.join('')
    expect(todo).not.toContain(TOKEN)
    expect(todo).not.toContain('CODIGO_SECRETO_ES')
  })
})

describe('SEC-101: rate limit no POST /numeros', () => {
  it('estoura apos o teto configurado da rota', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(stubOk())
    const h = auth(f.userId, f.lojaId)
    let viu429 = false
    for (let i = 0; i < 7; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/numeros',
        headers: h,
        payload: { codigo: 'c', waba_id: 'W', phone_number_id: `PN_RL_${i}` },
      })
      if (res.statusCode === 429) viu429 = true
    }
    await app.close()
    expect(viu429).toBe(true)
  })
})
