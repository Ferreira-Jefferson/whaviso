import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { OnboardingSaida } from './schemas'
import * as service from './service'

export const onboardingRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const config = { acesso: 'conteudo_de_loja' as const }
  const guarda = [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]

  // Loja efetiva = SO a do escopo resolvido (nunca corpo/query).
  app.get(
    '/',
    { config, preHandler: guarda, schema: { response: { 200: OnboardingSaida } } },
    async (req) => {
      // exigirPermissao ja barrou (403) quando nao ha loja ativa.
      return service.obter(app.pool, req.escopo!.loja_ativa!)
    },
  )
}
