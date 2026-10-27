// Rotas /v1/conta/*. Auth: so `autenticar` (o membro e resolvido por user_id em `membros`;
// conta/loja nunca vem do corpo, SEC-002). Conta nova nao tem loja, logo nao usa `escopoLoja`.
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { naoAutorizado } from '../../shared/http_errors'
import {
  ContaAtualizarEntrada,
  ContaCriarEntrada,
  ContaSaida,
  IdParams,
  MembroPapelAtualizarEntrada,
  MembroSaida,
  MembrosSaida,
} from './schemas'
import { alterarMembro, criarConta, lerConta, listar, renomear } from './service'
import { rotasConvites } from './routes_convites'

export const contaRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const acesso = { acesso: 'conteudo_de_loja' as const }
  const auth = [app.autenticar]
  const quem = (req: { usuario: { user_id: string } | null }): string => {
    if (!req.usuario) throw naoAutorizado()
    return req.usuario.user_id
  }

  app.post(
    '/',
    {
      config: { ...acesso, rateLimit: { max: 10, timeWindow: '1 minute' } },
      preHandler: auth,
      schema: { body: ContaCriarEntrada, response: { 200: ContaSaida, 201: ContaSaida } },
    },
    async (req, reply) => {
      const { conta, criada } = await criarConta(app.pool, quem(req), req.body.nome)
      return reply.status(criada ? 201 : 200).send(conta)
    },
  )

  app.get(
    '/',
    { config: acesso, preHandler: auth, schema: { response: { 200: ContaSaida } } },
    async (req) => lerConta(app.pool, quem(req)),
  )

  app.patch(
    '/',
    {
      config: acesso,
      preHandler: auth,
      schema: { body: ContaAtualizarEntrada, response: { 200: ContaSaida } },
    },
    async (req) => renomear(app.pool, quem(req), req.body.nome),
  )

  app.get(
    '/membros',
    { config: acesso, preHandler: auth, schema: { response: { 200: MembrosSaida } } },
    async (req) => ({ membros: await listar(app.pool, quem(req)) }),
  )

  app.patch(
    '/membros/:id',
    {
      config: acesso,
      preHandler: auth,
      schema: {
        params: IdParams,
        body: MembroPapelAtualizarEntrada,
        response: { 200: MembroSaida },
      },
    },
    async (req) => alterarMembro(app.pool, quem(req), req.params.id, req.body),
  )

  await app.register(rotasConvites)
}
