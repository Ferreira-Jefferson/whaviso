// Integracao + seguranca do modulo configuracoes_llm. Os testes de banco rodam no Postgres
// LOCAL (whaviso_dev por padrao, PGDATABASE sobrepoe) e se PULAM com aviso se o banco nao
// estiver acessivel. Os testes de adapter/cifra/import NAO dependem de banco e rodam sempre.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { verificadorFake } from '../../../test/app'
import { criarCifraLlm } from './cifra'
import { criarValidadoresProducao, HOSTS_PERMITIDOS, type RegistroValidadores } from './provedores'
import { criarRotasConfigLlm } from './routes'
import type { DepsConfigLlm } from './service'
import type { ResultadoValidacaoLlm } from './schemas'

const HOST = process.env.PGHOST ?? '127.0.0.1'
const DB = process.env.PGDATABASE ?? 'whaviso_dev'

// Senha do superusuario da fonte canonica backend/.env (o .env.test carrega uma senha de super
// desatualizada que sombra a correta). So para o DB LOCAL de teste; nunca e logada.
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
  host: HOST, port: 5432, user: 'whaviso_api', password: 'whaviso_api_dev', database: DB, max: 3,
})
const poolSuper = new pg.Pool({
  host: HOST, port: 5432, user: 'postgres', password: senhaSuper(), database: DB, max: 3,
})

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
    id, donoUserId, 'Conta de teste',
  ])
  c.contas.push(id)
  return id
}
async function criarLoja(contaId: string): Promise<string> {
  const id = randomUUID()
  await poolSuper.query('insert into public.lojas (id, conta_id, nome, ativo) values ($1,$2,$3,true)', [
    id, contaId, 'Loja de teste',
  ])
  return id
}
async function criarMembro(
  contaId: string, userId: string, papel: 'dono' | 'gerente' | 'atendente', lojaId: string,
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

// Chave sentinela (passa o min/max do contrato). Nunca pode aparecer em resposta/log/repouso.
const SENTINELA = 'sk-or-SENTINELA-CHAVE-LLM-NAO-VAZA-0123456789'
const SENTINELA_2 = 'sk-or-SEGUNDA-CHAVE-LLM-ROTATE-ABCDEFGHIJKL'
const MASTER_KEY = 'llm-master-key-de-teste-configuracoes-0123456789'
const cifra = criarCifraLlm(MASTER_KEY)

/** Validadores stub (sem rede): formato sempre plausivel, resultado configuravel. */
function stubValidadores(resultado: ResultadoValidacaoLlm, plausivel = true): RegistroValidadores {
  const v = { formatoPlausivel: () => plausivel, validar: async () => resultado }
  return { openrouter: v, anthropic: v }
}
function deps(resultado: ResultadoValidacaoLlm, plausivel = true): DepsConfigLlm {
  return { cifra, validadores: stubValidadores(resultado, plausivel) }
}

let disponivel = false

const env = envSchema.parse({
  DATABASE_URL: `postgresql://whaviso_api:whaviso_api_dev@${HOST}:5432/${DB}`,
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_DESLIGADO: 'true',
})

async function montarApp(
  d: DepsConfigLlm,
  logger: Parameters<typeof construirApp>[0]['logger'] = false,
) {
  return construirApp({
    env, pool: poolApi, logger, verificador: verificadorFake,
    modulos: [{ prefixo: 'llm', plugin: criarRotasConfigLlm(d) }],
  })
}

// SET ROLE como literais fixos (sem interpolacao; SEC-080).
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
  if (!disponivel) console.warn('[configuracoes_llm] banco indisponivel: testes de integracao pulados')
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
const PUT = (f: Fixtura, chave: string, extra: object = {}) => ({
  method: 'PUT' as const, url: '/v1/llm/credencial', headers: auth(f.userId, f.lojaId),
  payload: { provedor: 'openrouter', chave, ...extra },
})

// =============================================================================================
// Integracao / unidade
// =============================================================================================
describe('PUT /llm/credencial (set e rotate)', () => {
  it('set valido grava cifrado e devolve so metadado, SEM a chave (SEC-020)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    const res = await app.inject(PUT(f, SENTINELA, { modelo_preferido: 'anthropic/claude-sonnet-4' }))
    await app.close()
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({
      configurada: true, provedor: 'openrouter', ultimos4: '6789', ativo: true,
    })
    expect(body.validada_em).toBeTypeOf('string')
    // Nenhum vazamento do segredo nem campo de chave na resposta.
    expect(res.body).not.toContain(SENTINELA)
    expect(Object.keys(body)).not.toContain('chave')
    expect(Object.keys(body)).not.toContain('chave_cifrada')
  })

  it('chave invalida no provedor => 422 generico, NADA gravado', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('invalida'))
    const res = await app.inject(PUT(f, SENTINELA))
    await app.close()
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('chave_invalida')
    const { rows } = await poolApi.query('select count(*)::int n from public.credenciais_llm where loja_id=$1', [f.lojaId])
    expect(rows[0].n).toBe(0)
  })

  it('provedor indisponivel => 502 sem gravar (retry seguro)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('indisponivel'))
    const res = await app.inject(PUT(f, SENTINELA))
    await app.close()
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('provedor_indisponivel')
    const { rows } = await poolApi.query('select count(*)::int n from public.credenciais_llm where loja_id=$1', [f.lojaId])
    expect(rows[0].n).toBe(0)
  })

  it('rotate troca chave_cifrada e ultimos4; cifras de chaves iguais diferem (nonce novo)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    const r1 = await app.inject(PUT(f, SENTINELA))
    expect(r1.json().ultimos4).toBe('6789')
    const r2 = await app.inject(PUT(f, SENTINELA_2))
    await app.close()
    expect(r2.statusCode).toBe(200)
    expect(r2.json().ultimos4).toBe('IJKL')
    // So uma linha (unique por loja): rotate sobrescreveu.
    const { rows } = await poolApi.query('select count(*)::int n from public.credenciais_llm where loja_id=$1', [f.lojaId])
    expect(rows[0].n).toBe(1)
    // Duas cifras da MESMA chave sentinela diferem (nonce/DEK novos por chamada).
    const c1 = cifra.cifrar(SENTINELA)
    const c2 = cifra.cifrar(SENTINELA)
    expect(c1.equals(c2)).toBe(false)
  })

  it('provedor "outro" (sem host allowlisted) => 422 provedor_nao_validavel, nada gravado', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    const res = await app.inject(PUT(f, SENTINELA, { provedor: 'outro' }))
    await app.close()
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('provedor_nao_validavel')
  })

  it('loja_id forjado no corpo => 400 (strictObject, SEC-002)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    const res = await app.inject(PUT(f, SENTINELA, { loja_id: f.lojaId }))
    await app.close()
    expect(res.statusCode).toBe(400)
  })

  it('atendente NAO escreve (403) e nao ve a area de leitura (403)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('atendente'))
    const app = await montarApp(deps('valida'))
    const put = await app.inject(PUT(f, SENTINELA))
    const get = await app.inject({ method: 'GET', url: '/v1/llm/credencial', headers: auth(f.userId, f.lojaId) })
    await app.close()
    expect(put.statusCode).toBe(403)
    expect(get.statusCode).toBe(403)
  })

  it('gerente LE mas NAO escreve (so dono escreve)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('gerente'))
    const app = await montarApp(deps('valida'))
    const get = await app.inject({ method: 'GET', url: '/v1/llm/credencial', headers: auth(f.userId, f.lojaId) })
    const put = await app.inject(PUT(f, SENTINELA))
    await app.close()
    expect(get.statusCode).toBe(200)
    expect(put.statusCode).toBe(403)
  })
})

describe('isolamento multi-tenant (SEC-001)', () => {
  it('loja de outra conta no header => 404', async () => {
    if (!disponivel) return
    const a = registrar(await seedLojaComMembro('dono'))
    const b = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    const res = await app.inject({ method: 'GET', url: '/v1/llm/credencial', headers: auth(a.userId, b.lojaId) })
    await app.close()
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /llm/credencial, PATCH e GET /llm/uso', () => {
  it('estado vazio quando nao configurada (IA desligada)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    const res = await app.inject({ method: 'GET', url: '/v1/llm/credencial', headers: auth(f.userId, f.lojaId) })
    await app.close()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ configurada: false, provedor: null, ultimos4: null, ativo: false })
  })

  it('PATCH desativa (remove) e reativa; trocar modelo sem reenviar a chave', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    const h = auth(f.userId, f.lojaId)
    await app.inject(PUT(f, SENTINELA))
    const off = await app.inject({ method: 'PATCH', url: '/v1/llm/credencial', headers: h, payload: { ativo: false } })
    expect(off.json()).toMatchObject({ ativo: false, configurada: false })
    const mod = await app.inject({ method: 'PATCH', url: '/v1/llm/credencial', headers: h, payload: { modelo_preferido: 'openrouter/auto' } })
    expect(mod.json()).toMatchObject({ modelo_preferido: 'openrouter/auto' })
    const on = await app.inject({ method: 'PATCH', url: '/v1/llm/credencial', headers: h, payload: { ativo: true } })
    await app.close()
    expect(on.json()).toMatchObject({ ativo: true, configurada: true, ultimos4: '6789' })
  })

  it('PATCH sem credencial => 404', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    const res = await app.inject({ method: 'PATCH', url: '/v1/llm/credencial', headers: auth(f.userId, f.lojaId), payload: { ativo: false } })
    await app.close()
    expect(res.statusCode).toBe(404)
  })

  it('PATCH com corpo vazio => 400 (refine: nenhum campo)', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    const res = await app.inject({ method: 'PATCH', url: '/v1/llm/credencial', headers: auth(f.userId, f.lojaId), payload: {} })
    await app.close()
    expect(res.statusCode).toBe(400)
  })

  it('GET /llm/uso agrega consumo do mes e sinaliza pico', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    // Seed de uso: dias baixos e um pico hoje.
    for (let i = 10; i >= 2; i--) {
      await poolSuper.query(
        `insert into public.uso_llm (loja_id, provedor, modelo, origem, tokens_entrada, tokens_saida, custo_estimado_centavos, criado_em)
         values ($1,'openrouter','m1','atendente',10,10,100, now() - ($2 || ' days')::interval)`,
        [f.lojaId, i],
      )
    }
    await poolSuper.query(
      `insert into public.uso_llm (loja_id, provedor, modelo, origem, tokens_entrada, tokens_saida, custo_estimado_centavos)
       values ($1,'openrouter','m1','atendente',500,500,9000)`,
      [f.lojaId],
    )
    const app = await montarApp(deps('valida'))
    const res = await app.inject({ method: 'GET', url: '/v1/llm/uso', headers: auth(f.userId, f.lojaId) })
    await app.close()
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total_mes_centavos).toBeGreaterThan(0)
    expect(body.por_origem[0].rotulo).toBe('atendente')
    expect(body.pico).toBe(true)
  })
})

// =============================================================================================
// Seguranca
// =============================================================================================
describe('SEC-020: a chave nunca aparece em NENHUMA resposta (sucesso, erro, validacao)', () => {
  it('varre sucesso, 422 invalida, 502 indisponivel e teste', async () => {
    if (!disponivel) return
    const corpos: string[] = []
    for (const resultado of ['valida', 'invalida', 'indisponivel'] as const) {
      const f = registrar(await seedLojaComMembro('dono'))
      const app = await montarApp(deps(resultado))
      const h = auth(f.userId, f.lojaId)
      corpos.push((await app.inject(PUT(f, SENTINELA))).body)
      corpos.push((await app.inject({ method: 'POST', url: '/v1/llm/credencial/testar', headers: h, payload: { provedor: 'openrouter', chave: SENTINELA } })).body)
      corpos.push((await app.inject({ method: 'GET', url: '/v1/llm/credencial', headers: h })).body)
      await app.close()
    }
    for (const b of corpos) expect(b).not.toContain(SENTINELA)
  })
})

describe('SEC-021: whaviso_api nao faz SELECT de chave_cifrada (grant por coluna)', () => {
  it('select chave_cifrada falha; select * falha; metadado passa', async () => {
    if (!disponivel) return
    await expect(
      sobRole('whaviso_api', (q) => q('select chave_cifrada from public.credenciais_llm limit 1')),
    ).rejects.toThrow()
    await expect(
      sobRole('whaviso_api', (q) => q('select * from public.credenciais_llm limit 1')),
    ).rejects.toThrow()
    await expect(
      sobRole('whaviso_api', (q) => q('select provedor, ultimos4 from public.credenciais_llm limit 1')),
    ).resolves.toBeDefined()
  })
})

describe('SEC-023: cifra em repouso (um dump/leitura crua nao revela a chave)', () => {
  it('os bytes gravados nao contem o texto claro', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    await app.inject(PUT(f, SENTINELA))
    await app.close()
    // So o atendente le a coluna do segredo (grant por coluna). Os bytes em repouso nao batem com o claro.
    const cifrado = await sobRole('whaviso_atendente', async (q) => {
      const { rows } = await q('select chave_cifrada from public.credenciais_llm where loja_id=$1', [f.lojaId])
      return rows[0].chave_cifrada as Buffer
    })
    expect(Buffer.isBuffer(cifrado)).toBe(true)
    expect(cifrado.toString('utf8')).not.toContain(SENTINELA)
    expect(cifrado.toString('latin1')).not.toContain(SENTINELA)
  })
})

describe('SEC-024: a chave nunca entra em log (redaction aninhada)', () => {
  it('log capturado em set/rotate/erro nao contem a sentinela', async () => {
    if (!disponivel) return
    const { criarLogger } = await import('@whaviso/shared/logger')
    const linhas: string[] = []
    const logger = criarLogger('config-llm-test', 'info', { write: (s: string) => void linhas.push(s) })
    const f = registrar(await seedLojaComMembro('dono'))
    const appOk = await montarApp(deps('valida'), logger)
    await appOk.inject(PUT(f, SENTINELA)) // set
    await appOk.inject(PUT(f, SENTINELA_2)) // rotate
    await appOk.close()
    const appErro = await montarApp(deps('invalida'), logger)
    await appErro.inject(PUT(f, SENTINELA)) // erro 422
    await appErro.close()
    const todo = linhas.join('')
    expect(todo).not.toContain(SENTINELA)
    expect(todo).not.toContain(SENTINELA_2)
  })
})

// =============================================================================================
// Adapter de provedor (SEC-070 / SEC-026) e cifra write-only (SEC-022 apoio) -- sem banco
// =============================================================================================
describe('SEC-070 / SEC-026: adapter de provedor', () => {
  it('chama host allowlisted, com redirect:error e a chave so no header de auth', async () => {
    const chamadas: Array<{ url: string; init: RequestInit }> = []
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), init: init ?? {} })
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const v = criarValidadoresProducao(fakeFetch)
    expect(await v.openrouter!.validar('sk-or-chave-de-teste-123456')).toBe('valida')
    expect(await v.anthropic!.validar('sk-ant-chave-de-teste-123456')).toBe('valida')

    const hosts = Object.values(HOSTS_PERMITIDOS) as string[]
    for (const c of chamadas) {
      // Host sempre allowlisted (SEC-070).
      expect(hosts).toContain(new URL(c.url).host)
      // Nao segue redirect para rede interna (SEC-070).
      expect(c.init.redirect).toBe('error')
      // A chave vai SO no header de auth, nunca na URL/query (SEC-026).
      expect(c.url).not.toContain('chave-de-teste')
      const headers = c.init.headers as Record<string, string>
      const cabecalhoAuth = headers.authorization ?? headers['x-api-key'] ?? ''
      expect(cabecalhoAuth).toContain('chave-de-teste')
    }
  })

  it('erro de rede / redirect barrado => indisponivel (nunca propaga o erro cru)', async () => {
    const fetchQueExplode = (async () => {
      throw new Error('failed to fetch (redirect/DNS)')
    }) as typeof fetch
    const v = criarValidadoresProducao(fetchQueExplode)
    expect(await v.openrouter!.validar('sk-or-x-123456789012')).toBe('indisponivel')
  })

  it('401/403 do provedor => invalida; outros status => indisponivel', async () => {
    const fetch401 = (async () => new Response('', { status: 401 })) as typeof fetch
    const fetch500 = (async () => new Response('', { status: 500 })) as typeof fetch
    expect(await criarValidadoresProducao(fetch401).openrouter!.validar('sk-or-x-123456789012')).toBe('invalida')
    expect(await criarValidadoresProducao(fetch500).openrouter!.validar('sk-or-x-123456789012')).toBe('indisponivel')
  })

  it('formato implausivel e barrado antes da rede', async () => {
    let chamou = false
    const fetchMarca = (async () => {
      chamou = true
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const v = criarValidadoresProducao(fetchMarca)
    expect(v.openrouter!.formatoPlausivel('chave-sem-prefixo')).toBe(false)
    expect(v.anthropic!.formatoPlausivel('sk-ant-ok-123456789')).toBe(true)
    expect(chamou).toBe(false)
  })
})

describe('SEC-022 (apoio): a api cifra mas NAO decifra', () => {
  it('a cifra da api so expoe cifrar (sem metodo de decifrar)', () => {
    const c = criarCifraLlm(MASTER_KEY) as unknown as Record<string, unknown>
    expect(typeof c.cifrar).toBe('function')
    expect('decifrar' in c).toBe(false)
  })

  it('o fonte de cifra.ts da api nao chama a funcao de decifrar do kernel', () => {
    const aqui = dirname(fileURLToPath(import.meta.url))
    const fonte = readFileSync(resolve(aqui, 'cifra.ts'), 'utf8')
    expect(fonte).not.toContain('.decifrar(')
    expect(fonte).not.toContain('decifrar:')
  })

  it('os bytes cifrados nao contem o texto claro', () => {
    const bytes = cifra.cifrar(SENTINELA)
    expect(bytes.toString('utf8')).not.toContain(SENTINELA)
    expect(bytes.toString('latin1')).not.toContain(SENTINELA)
  })
})

describe('SEC-101: rate limit em PUT /llm/credencial', () => {
  it('estoura apos o teto configurado da rota', async () => {
    if (!disponivel) return
    const f = registrar(await seedLojaComMembro('dono'))
    const app = await montarApp(deps('valida'))
    let viu429 = false
    for (let i = 0; i < 7; i++) {
      const res = await app.inject(PUT(f, SENTINELA))
      if (res.statusCode === 429) viu429 = true
    }
    await app.close()
    expect(viu429).toBe(true)
  })
})
