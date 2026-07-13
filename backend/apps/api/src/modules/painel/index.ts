import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  painelMetricasQuery,
  painelMetricasResposta,
  painelPendenciasResposta,
  painelResumoQuery,
  painelResumoResposta,
} from '@whaviso/shared/contracts'
import * as repo from './repo'

export const painelRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  // H9.2: totais POR PAPEL (a receber/recebido como cobrador; a pagar/pago como
  // devedor), em centavos, calculados no backend. Isolamento por req.userId.
  app.get(
    '/painel/resumo',
    { preHandler: app.autenticar, schema: { querystring: painelResumoQuery, response: { 200: painelResumoResposta } } },
    (req) => repo.totaisPorPapel(app.pool, { uid: req.userId, de: req.query.de, ate: req.query.ate }),
  )

  // H9.2: "precisa de você". Reúne o que aguarda ação do usuário (sem dado sensível).
  app.get(
    '/painel/pendencias',
    { preHandler: app.autenticar, schema: { response: { 200: painelPendenciasResposta } } },
    async (req) => {
      const itens = await repo.pendencias(app.pool, req.userId)
      return { itens, total: itens.length }
    },
  )

  // Fase A: métricas de negócio (papel cobrador): lucro, ticket médio, melhores clientes,
  // por categoria e inativos. Só leitura, calculado no servidor. Isolamento por req.userId.
  app.get(
    '/painel/metricas',
    { preHandler: app.autenticar, schema: { querystring: painelMetricasQuery, response: { 200: painelMetricasResposta } } },
    (req) =>
      repo.metricas(app.pool, {
        uid: req.userId,
        de: req.query.de,
        ate: req.query.ate,
        categoria_id: req.query.categoria_id,
        sem_categoria: req.query.sem_categoria,
        inativoDias: req.query.inativo_dias,
      }),
  )
}
