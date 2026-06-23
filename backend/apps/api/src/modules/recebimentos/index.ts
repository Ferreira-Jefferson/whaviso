import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import * as service from './service'

const idParam = z.object({ id: z.uuid() })

export const recebimentosRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  app.post(
    '/avisos/:id/confirmar-recebimento',
    { preHandler: app.autenticar, schema: { params: idParam } },
    async (req) => service.confirmarRecebimento(app.pool, req.userId, req.params.id),
  )

  app.post(
    '/avisos/:id/desmarcar-recebimento',
    { preHandler: app.autenticar, schema: { params: idParam } },
    async (req) => service.desmarcarRecebimento(app.pool, req.userId, req.params.id),
  )

  app.post(
    '/avisos/:id/rejeitar-pagamento',
    { preHandler: app.autenticar, schema: { params: idParam } },
    async (req) => service.rejeitarPagamento(app.pool, req.userId, req.params.id),
  )

  app.post(
    '/avisos/:id/marcar-pago-devedor',
    { preHandler: app.autenticar, schema: { params: idParam } },
    async (req) => service.marcarPagoDevedor(app.pool, req.userId, req.params.id),
  )

  // H8.3: reengajamento manual pós-ciclo (só cobrador; só `programado` e ciclo encerrado).
  app.post(
    '/avisos/:id/reengajar',
    { preHandler: app.autenticar, schema: { params: idParam } },
    async (req) => service.reengajar(app.pool, req.userId, req.params.id),
  )

  app.post(
    '/avisos/:id/encerrar-lembretes',
    { preHandler: app.autenticar, schema: { params: idParam } },
    async (req) => service.encerrarLembretes(app.pool, req.userId, req.params.id),
  )
}
