// Base do SEC-020 (chave de LLM nunca em resposta): prova o TRILHO da varredura de respostas e a
// fabrica de atores com JWKS local. Monta um app minimo com uma rota que VAZA uma sentinela de
// proposito e uma rota limpa, e confirma:
//   - o scanner aponta exatamente o vazamento (rota + caminho JSON), sem imprimir o valor;
//   - sem a rota que vaza, o scanner passa limpo;
//   - os atores JWKS locais autenticam de verdade (anon 401, membro 200), sem Supabase.
// O SEC-020 "de producao" liga este scanner no registry real quando os modulos de dados existirem.
import Fastify from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { autenticarPlugin } from '../../apps/api/src/shared/auth'
import { tratadorDeErros } from '../../apps/api/src/shared/http_errors'
import { criarAtoresLocais, type AtoresLocais } from '../helpers/atores_teste'
import { varrerRespostas, acharSentinela, type Rota } from '../helpers/varre_respostas'
import { SENTINELAS } from '../fixtures/segredos'

async function montarApp(atores: AtoresLocais) {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>()
  app.setErrorHandler(tratadorDeErros)
  await app.register(autenticarPlugin, { verificador: atores.verificador })

  // Rota que VAZA (planta o segredo no corpo, como um endpoint mal escrito faria).
  app.get('/config-llm/vaza', async () => ({
    provedor: 'outro',
    credencial: { chave_cifrada: SENTINELAS.chaveLlm },
  }))
  // Rota limpa: so o metadado seguro.
  app.get('/config-llm/limpo', async () => ({ provedor: 'outro', ultimos4: '1d' }))
  // Rota autenticada: devolve o usuario (sub), nunca segredo.
  app.get('/privado', { preHandler: [app.autenticar] }, async (req) => ({ usuario: req.usuario }))

  await app.ready()
  return app
}

describe('SEC-020 (trilho): varredura de respostas e atores JWKS locais', () => {
  let atores: AtoresLocais
  let app: Awaited<ReturnType<typeof montarApp>>

  beforeAll(async () => {
    atores = await criarAtoresLocais()
    app = await montarApp(atores)
  })
  afterAll(async () => {
    await app.close()
  })

  it('o scanner aponta a rota e o caminho JSON do vazamento plantado', async () => {
    const tokenA = await atores.mint(atores.subs.membroA)
    const rotas: Rota[] = [
      { method: 'GET', url: '/config-llm/vaza' },
      { method: 'GET', url: '/config-llm/limpo' },
    ]
    const respostas = await varrerRespostas(app, rotas, [{ nome: 'membroA', token: tokenA }, { nome: 'anon' }])
    const vazamentos = acharSentinela(respostas, SENTINELAS.chaveLlm)

    expect(vazamentos.length, 'o scanner deveria achar o vazamento plantado').toBeGreaterThan(0)
    expect(vazamentos.every((v) => v.rota.includes('/config-llm/vaza'))).toBe(true)
    expect(vazamentos[0]!.caminho).toBe('credencial.chave_cifrada')
  })

  it('sem a rota que vaza, o scanner passa limpo', async () => {
    const respostas = await varrerRespostas(app, [{ method: 'GET', url: '/config-llm/limpo' }], [{ nome: 'anon' }])
    expect(acharSentinela(respostas, SENTINELAS.chaveLlm)).toEqual([])
  })

  it('atores JWKS locais autenticam: anon 401, membro valido 200, assinatura trocada 401', async () => {
    const anon = await app.inject({ method: 'GET', url: '/privado' })
    expect(anon.statusCode).toBe(401)

    const tokenA = await atores.mint(atores.subs.membroA)
    const ok = await app.inject({ method: 'GET', url: '/privado', headers: { authorization: `Bearer ${tokenA}` } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().usuario.user_id).toBe(atores.subs.membroA)

    const falso = await atores.mintAssinaturaErrada(atores.subs.membroA)
    const mau = await app.inject({ method: 'GET', url: '/privado', headers: { authorization: `Bearer ${falso}` } })
    expect(mau.statusCode).toBe(401)
  })

  it('token expirado e rejeitado (401)', async () => {
    const expirado = await atores.mint({ sub: atores.subs.membroA, expiraEmSeg: -10 })
    const res = await app.inject({ method: 'GET', url: '/privado', headers: { authorization: `Bearer ${expirado}` } })
    expect(res.statusCode).toBe(401)
  })
})
