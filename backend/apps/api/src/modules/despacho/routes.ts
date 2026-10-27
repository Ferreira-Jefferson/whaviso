import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import {
  AdicionarPedidosEntrada, AtribuirMotoboyEntrada, CorridaEntrada, CorridaPedidoParams, CorridaSaida,
  DespachoPainelSaida, IdParams, PedidoDespachoSaida, ReordenarParadasEntrada,
} from './schemas'
import * as service from './service'
import type { Ator } from './service'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const despachoRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const config = { acesso: 'conteudo_de_loja' as const }
  // Despacho e operacao do kanban: quem gerencia pedidos (dono, gerente e atendente).
  const operar = { config, preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')] }

  app.get('/', { ...operar, schema: { response: { 200: DespachoPainelSaida } } },
    async (req) => service.painel(app.pool, ator(req)))

  // --- Motoboy do pedido ---
  app.post('/pedidos/:id/motoboy', {
    ...operar, schema: { params: IdParams, body: AtribuirMotoboyEntrada, response: { 200: PedidoDespachoSaida } },
  }, async (req) => service.atribuirMotoboyPedido(app.pool, ator(req), req.params.id, req.body.motoboy_id))

  app.post('/pedidos/:id/motoboy/remover', {
    ...operar, schema: { params: IdParams, response: { 200: PedidoDespachoSaida } },
  }, async (req) => service.removerMotoboyPedido(app.pool, ator(req), req.params.id))

  // --- Corridas ---
  app.post('/corridas', {
    ...operar, schema: { body: CorridaEntrada, response: { 201: CorridaSaida } },
  }, async (req, reply) => reply.status(201).send(await service.criarCorrida(app.pool, ator(req), req.body)))

  app.get('/corridas/:id', {
    ...operar, schema: { params: IdParams, response: { 200: CorridaSaida } },
  }, async (req) => service.obterCorrida(app.pool, ator(req), req.params.id))

  app.post('/corridas/:id/pedidos', {
    ...operar, schema: { params: IdParams, body: AdicionarPedidosEntrada, response: { 200: CorridaSaida } },
  }, async (req) => service.adicionarPedidos(app.pool, ator(req), req.params.id, req.body.pedido_ids))

  app.post('/corridas/:id/pedidos/:pedidoId/remover', {
    ...operar, schema: { params: CorridaPedidoParams, response: { 200: CorridaSaida } },
  }, async (req) => service.removerPedido(app.pool, ator(req), req.params.id, req.params.pedidoId))

  app.put('/corridas/:id/ordem', {
    ...operar, schema: { params: IdParams, body: ReordenarParadasEntrada, response: { 200: CorridaSaida } },
  }, async (req) => service.reordenar(app.pool, ator(req), req.params.id, req.body.pedido_ids))

  app.post('/corridas/:id/motoboy', {
    ...operar, schema: { params: IdParams, body: AtribuirMotoboyEntrada, response: { 200: CorridaSaida } },
  }, async (req) => service.atribuirMotoboyCorrida(app.pool, ator(req), req.params.id, req.body.motoboy_id))

  app.post('/corridas/:id/despachar', {
    ...operar, schema: { params: IdParams, response: { 200: CorridaSaida } },
  }, async (req) => service.despachar(app.pool, ator(req), req.params.id))

  app.post('/corridas/:id/concluir', {
    ...operar, schema: { params: IdParams, response: { 200: CorridaSaida } },
  }, async (req) => service.concluir(app.pool, ator(req), req.params.id))

  app.post('/corridas/:id/cancelar', {
    ...operar, schema: { params: IdParams, response: { 200: CorridaSaida } },
  }, async (req) => service.cancelar(app.pool, ator(req), req.params.id))
}
