import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { syncVersaoResposta } from '@whaviso/shared/contracts'
import * as repo from './repo'

export const syncRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  // Carimbo barato do estado do usuário logado: o front consulta em intervalo curto e só
  // recarrega painel/avisos quando `versao` avança (detecção de mudança por versão, em
  // vez de refetch-on-mount/foco de janela). Isolamento por req.userId.
  app.get(
    '/sync/versao',
    { preHandler: app.autenticar, schema: { response: { 200: syncVersaoResposta } } },
    async (req) => ({ versao: await repo.versao(app.pool, req.userId) }),
  )
}
