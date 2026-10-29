import type { FastifyPluginAsync, FastifyRequest, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { naoAutorizado, proibido } from '../../shared/http_errors'
import { criarServicoChavesApi } from './service'
import { ChaveApiCriada, ChaveApiDTO, ChaveApiLista, ChaveParams, ContaParams, NovaChave } from './schemas'

/** Gestao de chaves: so `admin` da plataforma (roda depois de `escopoOperador`). */
const exigirAdmin: preHandlerHookHandler = async (req: FastifyRequest) => {
  const o = req.operador
  if (!o) throw naoAutorizado()
  if (o.papel !== 'admin') throw proibido('Apenas admin gere chaves de API')
}

export function criarChavesApiRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoChavesApi(app.pool)
    // Rota de plataforma: a chave de API nunca autentica aqui (ver shared/auth).
    const plataforma = (extra: object = {}) => ({ config: { acesso: 'plataforma' as const, ...extra } })
    const admin = [app.autenticar, app.escopoOperador, exigirAdmin]

    app.get('/contas/:contaId/chaves', {
      ...plataforma(), preHandler: admin,
      schema: { params: ContaParams, response: { 200: ChaveApiLista } },
    }, async (req) => svc.listar(req.params.contaId))

    app.post('/contas/:contaId/chaves', {
      ...plataforma({ rateLimit: { max: 20, timeWindow: '1 minute' } }), preHandler: admin,
      schema: { params: ContaParams, body: NovaChave, response: { 201: ChaveApiCriada } },
    }, async (req, reply) => {
      const o = req.operador
      if (!o) throw naoAutorizado()
      return reply.status(201).send(await svc.criar({ userId: o.user_id }, req.params.contaId, req.body))
    })

    // Revogar (rotulo de UI "Excluir"): soft, nunca DELETE (SEC-030).
    app.post('/contas/:contaId/chaves/:id/revogar', {
      ...plataforma({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: admin,
      schema: { params: ChaveParams, response: { 200: ChaveApiDTO } },
    }, async (req) => {
      const o = req.operador
      if (!o) throw naoAutorizado()
      return svc.revogar({ userId: o.user_id }, req.params.contaId, req.params.id)
    })
  }
}

export const chavesApiRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarChavesApiRoutes()(instancia, opts)
