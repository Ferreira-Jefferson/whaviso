// Rotas de convite: /v1/conta/convites (gestao) e /v1/conta/convites/aceitar (qualquer autenticado).
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { naoAutorizado } from '../../shared/http_errors'
import {
  ConviteAceitarEntrada,
  ConviteAceitarSaida,
  ConviteCriarEntrada,
  ConviteSaida,
  ConvitesSaida,
  IdParams,
} from './schemas'
import { aceitar, criarConvite, listarConvites, revogar } from './convites'

export const rotasConvites: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const acesso = { acesso: 'conteudo_de_loja' as const }
  const auth = [app.autenticar]
  const quem = (req: { usuario: { user_id: string } | null }): string => {
    if (!req.usuario) throw naoAutorizado()
    return req.usuario.user_id
  }

  app.post(
    '/convites',
    {
      config: { ...acesso, rateLimit: { max: 30, timeWindow: '1 minute' } },
      preHandler: auth,
      schema: { body: ConviteCriarEntrada, response: { 201: ConviteSaida } },
    },
    async (req, reply) => {
      const convite = await criarConvite(app.pool, quem(req), req.body, app.env.APP_URL)
      return reply.status(201).send(convite)
    },
  )

  app.get(
    '/convites',
    { config: acesso, preHandler: auth, schema: { response: { 200: ConvitesSaida } } },
    async (req) => ({ convites: await listarConvites(app.pool, quem(req)) }),
  )

  app.post(
    '/convites/:id/revogar',
    {
      config: acesso,
      preHandler: auth,
      schema: { params: IdParams },
    },
    async (req, reply) => {
      await revogar(app.pool, quem(req), req.params.id)
      return reply.status(204).send()
    },
  )

  // SEC-101: rate limit por IP contra forca bruta de token.
  app.post(
    '/convites/aceitar',
    {
      config: { ...acesso, rateLimit: { max: 10, timeWindow: '1 minute' } },
      preHandler: auth,
      schema: { body: ConviteAceitarEntrada, response: { 200: ConviteAceitarSaida } },
    },
    async (req) => aceitar(app.pool, quem(req), req.body.token),
  )
}
