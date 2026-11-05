// Integracao + seguranca do CONSOLE de numeros (plataforma_numeros). Roda no Postgres LOCAL
// (banco por worker, ver backend/test-support). Pula com aviso se o banco nao estiver acessivel.
//
// Cobre: operador gere numero de QUALQUER loja por params; segredo (token) nunca sai em resposta
// nem log (SEC-020/024); SEC-003 nao regride (membro de loja barrado no console; operador barrado
// na rota de conteudo da loja); loja/numero inexistente -> 404; permissao `:ver` vs `:gerir`.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import { criarLogger } from '@whaviso/shared/logger'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { verificadorFake } from '../../../test/app'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools,
  limpar, novoCenario, poolApi, poolSuper, type Cenario,
} from '../../../test/db'
import { criarCripto, ErroMeta, type MetaOnboarding } from '../../shared/numeros'
import { criarRotasPlataformaNumeros } from './routes'
import { criarRotasNumeros } from '../numeros_whatsapp/routes'

const MASTER_KEY = 'master-key-de-teste-plataforma-numeros-0123456789'
const cripto = criarCripto(MASTER_KEY)
const TOKEN = 'META_TOKEN_SECRETO_console_round_trip'
const NUMERO = '+5511977776666'

let disponivel = false

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
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

const logs: string[] = []
function destinoLog(): Writable {
  return new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })
}

/** Monta a app com o console E as rotas da loja (p/ o cross-check de SEC-003). */
async function montarApp(onboarding: MetaOnboarding, comLog = false) {
  return construirApp({
    env,
    pool: poolApi,
    logger: comLog ? criarLogger('plataforma-numeros-teste', 'info', destinoLog()) : false,
    verificador: verificadorFake,
    modulos: [
      { prefixo: 'plataforma-numeros', plugin: criarRotasPlataformaNumeros({ onboarding, cripto }) },
      { prefixo: 'numeros', plugin: criarRotasNumeros({ onboarding, cripto }) },
    ],
  })
}

// Statements de SET ROLE como literais fixos (sem interpolacao; SEC-080).
const SET_ROLE = { whaviso_zap: 'set role whaviso_zap' } as const
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
  lojaId: string
  operador: string
  suporte: string
  donoLoja: string
}

/** Operador 'suporte' (so `:ver`); o helper criarOperador so cobre operador/admin.
 *  A limpeza e por user_id em `limpar` (delete de operadores por user). */
async function criarSuporte(userId: string): Promise<void> {
  await poolSuper.query(
    "insert into public.operadores (id, user_id, nome, papel) values ($1,$2,$3,'suporte')",
    [randomUUID(), userId, 'Suporte de teste'],
  )
}

async function seed(): Promise<Fixtura> {
  const cenario = novoCenario()
  const donoLoja = await criarUsuario(cenario)
  const contaId = await criarConta(cenario, donoLoja)
  const lojaId = await criarLoja(contaId)
  await criarMembro(contaId, donoLoja, 'dono', null)
  const operadorUser = await criarUsuario(cenario)
  await criarOperador(operadorUser, 'operador')
  const suporteUser = await criarUsuario(cenario)
  await criarSuporte(suporteUser)
  return { cenario, lojaId, operador: operadorUser, suporte: suporteUser, donoLoja }
}

const auth = (userId: string) => ({ authorization: `Bearer ${userId}` })
const BASE = '/v1/plataforma-numeros'

beforeAll(async () => {
  disponivel = await bancoAcessivel()
  if (!disponivel) console.warn('[plataforma_numeros] banco indisponivel: testes de integracao pulados')
})
afterAll(fecharPools)

const cenarios: Cenario[] = []
afterEach(async () => {
  for (const c of cenarios.splice(0)) await limpar(c)
  logs.length = 0
})
function registrar(f: Fixtura): Fixtura {
  cenarios.push(f.cenario)
  return f
}

describe('escopo do console (SEC-003 / SEC-001)', () => {
  it('401 sem token em todas as rotas', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    const rotas: [string, string, unknown?][] = [
      ['GET', `/lojas/${f.lojaId}/numeros`],
      ['POST', `/lojas/${f.lojaId}/numeros`, { codigo: 'c', waba_id: 'W', phone_number_id: 'PN' }],
      ['GET', `/numeros/${randomUUID()}`],
      ['PATCH', `/numeros/${randomUUID()}/status`, { acao: 'pausar' }],
      ['POST', `/numeros/${randomUUID()}/reconectar`, { codigo: 'c' }],
    ]
    for (const [method, url, payload] of rotas) {
      const res = await app.inject({ method: method as 'GET', url: `${BASE}${url}`, payload: payload as object })
      expect(res.statusCode, `${method} ${url}`).toBe(401)
    }
    await app.close()
  })

  it('membro de loja (dono) recebe 403 em todas as rotas do console', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    const rotas: [string, string, unknown?][] = [
      ['GET', `/lojas/${f.lojaId}/numeros`],
      ['POST', `/lojas/${f.lojaId}/numeros`, { codigo: 'c', waba_id: 'W', phone_number_id: 'PN' }],
      ['GET', `/numeros/${randomUUID()}`],
      ['PATCH', `/numeros/${randomUUID()}/status`, { acao: 'pausar' }],
      ['POST', `/numeros/${randomUUID()}/reconectar`, { codigo: 'c' }],
    ]
    for (const [method, url, payload] of rotas) {
      const res = await app.inject({
        method: method as 'GET', url: `${BASE}${url}`, headers: auth(f.donoLoja), payload: payload as object,
      })
      expect(res.statusCode, `${method} ${url}`).toBe(403)
      expect(res.json().error.code).toBe('proibido')
    }
    await app.close()
  })

  it('SEC-003 nao regride: operador e barrado na rota de CONTEUDO da loja (/v1/numeros)', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    // Operador valido, mas a rota da loja e `conteudo_de_loja`: o escopo de operador nao se aplica
    // e o escopo de loja nega (operador nao e membro de loja alguma). O conteudo da loja nunca fica
    // acessivel ao operador por esta via; o acesso dele a numeros e so pelo console.
    const res = await app.inject({
      method: 'GET', url: '/v1/numeros', headers: { ...auth(f.operador), 'x-loja-id': f.lojaId },
    })
    await app.close()
    expect(res.statusCode).toBe(403) // sem vinculo de loja: barrado antes de qualquer conteudo
  })
})

describe('operador gere numero de QUALQUER loja por params', () => {
  it('conecta, lista, detalha, pausa/reativa, reconecta e remove (sem vazar o segredo)', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    const h = auth(f.operador)

    const criado = await app.inject({
      method: 'POST', url: `${BASE}/lojas/${f.lojaId}/numeros`, headers: h,
      payload: { codigo: 'code-es', waba_id: 'WABA', phone_number_id: 'PN_C1' },
    })
    expect(criado.statusCode, criado.body).toBe(201)
    const numero = criado.json()
    expect(numero).toMatchObject({ loja_id: f.lojaId, phone_number_id: 'PN_C1', status: 'conectado' })
    expect(criado.body).not.toContain(TOKEN)
    expect(criado.body).not.toContain(NUMERO)
    expect(criado.body.toLowerCase()).not.toContain('token')

    const lista = await app.inject({ method: 'GET', url: `${BASE}/lojas/${f.lojaId}/numeros`, headers: h })
    expect(lista.statusCode).toBe(200)
    expect(lista.json().numeros).toHaveLength(1)

    const det = await app.inject({ method: 'GET', url: `${BASE}/numeros/${numero.id}`, headers: h })
    expect(det.statusCode).toBe(200)
    expect(det.json().id).toBe(numero.id)
    expect(det.body).not.toContain(TOKEN)

    const pausa = await app.inject({
      method: 'PATCH', url: `${BASE}/numeros/${numero.id}/status`, headers: h, payload: { acao: 'pausar' },
    })
    expect(pausa.json().status).toBe('pausado')
    const reat = await app.inject({
      method: 'PATCH', url: `${BASE}/numeros/${numero.id}/status`, headers: h, payload: { acao: 'reativar' },
    })
    expect(reat.json().status).toBe('conectado')

    const recon = await app.inject({
      method: 'POST', url: `${BASE}/numeros/${numero.id}/reconectar`, headers: h, payload: { codigo: 'novo' },
    })
    expect(recon.statusCode).toBe(200)
    expect(recon.body).not.toContain(TOKEN)

    const remove = await app.inject({
      method: 'PATCH', url: `${BASE}/numeros/${numero.id}/status`, headers: h, payload: { acao: 'remover' },
    })
    expect(remove.json().status).toBe('removido')
    await app.close()

    // Remover zerou o token_cifrado (segredo nao permanece apos desconexao).
    const { rows } = await poolApi.query(
      'select token_cifrado from public.numeros_whatsapp where id=$1', [numero.id],
    )
    expect(rows[0].token_cifrado).toBeNull()
  })

  it('round trip do segredo: cifrado em repouso, zap decifra com a mesma master key (SEC-023)', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    const criado = (
      await app.inject({
        method: 'POST', url: `${BASE}/lojas/${f.lojaId}/numeros`, headers: auth(f.operador),
        payload: { codigo: 'c', waba_id: 'W', phone_number_id: 'PN_RT' },
      })
    ).json()
    await app.close()
    const cifrado = await sobRole('whaviso_zap', async (q) => {
      const { rows } = await q('select token_cifrado from public.numeros_whatsapp where id=$1', [criado.id])
      return rows[0].token_cifrado as Buffer
    })
    expect(cripto.decifrar(cifrado)).toBe(TOKEN)
    expect(cifrado.toString('utf8')).not.toContain(TOKEN)
  })
})

describe('alvo invalido e corpo malicioso', () => {
  it('loja inexistente => 404 (listar e conectar)', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    const fantasma = randomUUID()
    const lista = await app.inject({
      method: 'GET', url: `${BASE}/lojas/${fantasma}/numeros`, headers: auth(f.operador),
    })
    expect(lista.statusCode).toBe(404)
    const conectar = await app.inject({
      method: 'POST', url: `${BASE}/lojas/${fantasma}/numeros`, headers: auth(f.operador),
      payload: { codigo: 'c', waba_id: 'W', phone_number_id: 'PN_X' },
    })
    expect(conectar.statusCode).toBe(404)
    await app.close()
  })

  it('numero inexistente => 404 (detalhe, status, reconectar)', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    const id = randomUUID()
    const h = auth(f.operador)
    expect((await app.inject({ method: 'GET', url: `${BASE}/numeros/${id}`, headers: h })).statusCode).toBe(404)
    expect((await app.inject({
      method: 'PATCH', url: `${BASE}/numeros/${id}/status`, headers: h, payload: { acao: 'pausar' },
    })).statusCode).toBe(404)
    expect((await app.inject({
      method: 'POST', url: `${BASE}/numeros/${id}/reconectar`, headers: h, payload: { codigo: 'c' },
    })).statusCode).toBe(404)
    await app.close()
  })

  it('loja_id no corpo e rejeitado (SEC-002, strictObject)', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    const res = await app.inject({
      method: 'POST', url: `${BASE}/lojas/${f.lojaId}/numeros`, headers: auth(f.operador),
      payload: { codigo: 'c', waba_id: 'W', phone_number_id: 'PN', loja_id: f.lojaId },
    })
    await app.close()
    expect(res.statusCode).toBe(400)
  })

  it('lojaId malformado no param => 400', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    const res = await app.inject({
      method: 'GET', url: `${BASE}/lojas/nao-uuid/numeros`, headers: auth(f.operador),
    })
    await app.close()
    expect(res.statusCode).toBe(400)
  })

  it('falha da Meta nao grava registro parcial (502, zero linhas)', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubFalha)
    const res = await app.inject({
      method: 'POST', url: `${BASE}/lojas/${f.lojaId}/numeros`, headers: auth(f.operador),
      payload: { codigo: 'ruim', waba_id: 'W', phone_number_id: 'PN_FALHA' },
    })
    await app.close()
    expect(res.statusCode).toBe(502)
    const { rows } = await poolApi.query(
      'select count(*)::int n from public.numeros_whatsapp where loja_id=$1', [f.lojaId],
    )
    expect(rows[0].n).toBe(0)
  })
})

describe('grade de permissao do console (:ver vs :gerir)', () => {
  it('suporte (so :ver) lista, mas NAO conecta/muda/reconecta (403)', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk())
    const h = auth(f.suporte)

    const lista = await app.inject({ method: 'GET', url: `${BASE}/lojas/${f.lojaId}/numeros`, headers: h })
    expect(lista.statusCode, lista.body).toBe(200)

    const conectar = await app.inject({
      method: 'POST', url: `${BASE}/lojas/${f.lojaId}/numeros`, headers: h,
      payload: { codigo: 'c', waba_id: 'W', phone_number_id: 'PN_S' },
    })
    expect(conectar.statusCode).toBe(403)

    const status = await app.inject({
      method: 'PATCH', url: `${BASE}/numeros/${randomUUID()}/status`, headers: h, payload: { acao: 'pausar' },
    })
    expect(status.statusCode).toBe(403)

    const recon = await app.inject({
      method: 'POST', url: `${BASE}/numeros/${randomUUID()}/reconectar`, headers: h, payload: { codigo: 'c' },
    })
    expect(recon.statusCode).toBe(403)
    await app.close()
  })
})

describe('SEC-024: token e codigo nunca entram em log', () => {
  it('a saida de log (com redaction) nao contem token nem codigo', async () => {
    if (!disponivel) return
    const f = registrar(await seed())
    const app = await montarApp(stubOk(), true)
    await app.inject({
      method: 'POST', url: `${BASE}/lojas/${f.lojaId}/numeros`, headers: auth(f.operador),
      payload: { codigo: 'CODIGO_SECRETO_CONSOLE', waba_id: 'W', phone_number_id: 'PN_LOG' },
    })
    await app.close()
    const todo = logs.join('')
    expect(todo).not.toContain(TOKEN)
    expect(todo).not.toContain('CODIGO_SECRETO_CONSOLE')
  })
})
