import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { acaoBody } from '@whaviso/shared/contracts'
import * as service from './service'

const tokenParam = z.object({ token: z.string().min(20).max(64) })
const limiteToken = { rateLimit: { max: 10, timeWindow: '1 minute' } }

export const acoesDevedorRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  app.post(
    '/acao/:token',
    { config: limiteToken, schema: { params: tokenParam, body: acaoBody } },
    async (req) => service.registrarAcao(app.pool, req.params.token, req.body.acao),
  )
}
