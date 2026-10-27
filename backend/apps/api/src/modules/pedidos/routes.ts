import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { Cifra } from '@whaviso/shared/cifra'
import { cifraPadrao } from '@whaviso/shared/cifra'
import { HttpError } from '../../shared/http_errors'
import { criarServicoPedidos, type Ator } from './service'
import {
  IdParams, ImpressaoQuery, ItemParams, KanbanQuery, PedidoCriarManualEntrada, PedidoDetalheSaida,
  PedidoImpressaoSaida, PedidoKanbanSaida, PedidoStatusEntrada,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

/** Fabrica do plugin; `cifra` injetavel (testes). Padrao: cifra da MASTER_KEY (lazy). */
export function criarPedidosRoutes(cifra?: Cifra): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoPedidos(app.pool, () => cifra ?? cifraPadrao())
    const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
    const guarda = [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')]

    app.get('/', {
      ...loja(), preHandler: guarda,
      schema: { querystring: KanbanQuery, response: { 200: PedidoKanbanSaida } },
    }, async (req) => svc.kanban(ator(req), req.query))

    app.post('/', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: guarda,
      schema: { body: PedidoCriarManualEntrada, response: { 201: PedidoDetalheSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criarManual(ator(req), req.body)))

    app.get('/:id', {
      ...loja(), preHandler: guarda,
      schema: { params: IdParams, response: { 200: PedidoDetalheSaida } },
    }, async (req) => svc.detalhe(ator(req), req.params.id))

    app.post('/:id/status', {
      ...loja(), preHandler: guarda,
      schema: { params: IdParams, body: PedidoStatusEntrada, response: { 200: PedidoDetalheSaida } },
    }, async (req) => svc.mudarStatus(ator(req), req.params.id, req.body))

    app.post('/:id/itens/:itemId/cancelar', {
      ...loja(), preHandler: guarda,
      schema: { params: ItemParams, response: { 200: PedidoDetalheSaida } },
    }, async (req) => svc.cancelarLinha(ator(req), req.params.id, req.params.itemId))

    app.get('/:id/impressao', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: guarda,
      schema: { params: IdParams, querystring: ImpressaoQuery, response: { 200: PedidoImpressaoSaida } },
    }, async (req, reply) => {
      void reply.header('cache-control', 'no-store')
      return svc.imprimir(ator(req), req.params.id, req.query.formato, req.query.largura)
    })
  }
}

/** Plugin do registry: a cifra vem da MASTER_KEY da env (so para mascarar telefone). */
export const pedidosRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarPedidosRoutes()(instancia, opts)
