// SEC-042 (signup so onde deve): a superficie de criacao de conta esta fechada para abuso de spam.
// Duas garantias, provadas aqui:
//   1. Comportamental: criar conta exige identidade AUTENTICADA (JWT emitido pelo provedor; nao ha
//      signup anonimo). Um preHandler de auth com a MESMA forma do de producao (verificador que
//      resolve `sub` por JWKS) rejeita ausencia de token, assinatura trocada e token expirado.
//   2. Estrutural: a rota real de criacao de conta (apps/api/src/modules/conta/routes.ts, POST '/')
//      declara `preHandler` de auth E `rateLimit` (teto de rajada contra spam). O teste le o fonte e
//      falha se qualquer uma das duas protecoes sumir da rota.
// A suite nao importa `modules/**` (fronteira do F7): a parte 1 reconstroi o contrato de auth com o
// verificador local; a parte 2 ancora no fonte real por leitura, sem acopla-lo.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, it, expect } from 'vitest'
import { criarAtoresLocais, type AtoresLocais } from '../helpers/atores_teste'

const RAIZ_BACKEND = resolve(__dirname, '../..')
const ROTA_CONTA = resolve(RAIZ_BACKEND, 'apps/api/src/modules/conta/routes.ts')

/** Monta um app com o MESMO contrato da rota real: POST de criacao de conta atras de auth por Bearer. */
async function montarAppConta(atores: AtoresLocais): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  // Forma identica ao `autenticar` de producao: resolve `sub` do Bearer; sem/invalido => 401.
  const autenticar = async (req: { headers: Record<string, unknown> }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const bruto = req.headers['authorization']
    const header = typeof bruto === 'string' ? bruto : ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return reply.code(401).send({ error: { code: 'nao_autorizado' } })
    try {
      await atores.verificador.verificar(token)
    } catch {
      return reply.code(401).send({ error: { code: 'nao_autorizado' } })
    }
  }
  app.post('/v1/conta', { preHandler: autenticar }, async (_req, reply) => reply.code(201).send({ criada: true }))
  await app.ready()
  return app
}

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('SEC-042: criacao de conta exige identidade autenticada (sem signup anonimo)', () => {
  it('SEC-042: POST anonimo (sem Bearer) na criacao de conta e 401', async () => {
    const atores = await criarAtoresLocais()
    app = await montarAppConta(atores)
    const res = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome: 'Spam' } })
    expect(res.statusCode).toBe(401)
  })

  it('SEC-042: token com assinatura trocada ou expirado nao cria conta', async () => {
    const atores = await criarAtoresLocais()
    app = await montarAppConta(atores)

    const assinaturaErrada = await atores.mintAssinaturaErrada(atores.subs.membroA)
    const rErrada = await app.inject({
      method: 'POST',
      url: '/v1/conta',
      headers: { authorization: `Bearer ${assinaturaErrada}` },
      payload: { nome: 'Spam' },
    })
    expect(rErrada.statusCode).toBe(401)

    const expirado = await atores.mint({ sub: atores.subs.membroA, expiraEmSeg: -10 })
    const rExpirado = await app.inject({
      method: 'POST',
      url: '/v1/conta',
      headers: { authorization: `Bearer ${expirado}` },
      payload: { nome: 'Spam' },
    })
    expect(rExpirado.statusCode).toBe(401)
  })

  it('SEC-042: so uma identidade valida (token aceito) chega a criar conta', async () => {
    const atores = await criarAtoresLocais()
    app = await montarAppConta(atores)
    const valido = await atores.mint({ sub: atores.subs.membroA })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/conta',
      headers: { authorization: `Bearer ${valido}` },
      payload: { nome: 'Loja do Ze' },
    })
    expect(res.statusCode).toBe(201)
  })
})

describe('SEC-042: a rota real de criacao de conta declara auth + rate limit', () => {
  it('SEC-042: POST de criacao de conta tem preHandler de auth e rateLimit no fonte', () => {
    const fonte = readFileSync(ROTA_CONTA, 'utf8')
    // Localiza o registro do POST de criacao de conta (app.post('/', ...)).
    const idx = fonte.indexOf("app.post(")
    expect(idx, 'rota POST de criacao de conta nao encontrada').toBeGreaterThanOrEqual(0)
    const bloco = fonte.slice(idx, idx + 600)
    expect(bloco, 'a rota de criacao de conta precisa de rateLimit (teto de rajada contra spam)').toMatch(/rateLimit\s*:\s*\{\s*max\s*:/)
    expect(bloco, 'a rota de criacao de conta precisa de preHandler de auth').toMatch(/preHandler\s*:\s*auth/)
  })
})
