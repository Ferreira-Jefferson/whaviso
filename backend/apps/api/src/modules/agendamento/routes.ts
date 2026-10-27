import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoAgendamento, type Ator } from './service'
import {
  AgendamentoDefinirEntrada, AgendamentoSaida, AgendamentosEntrada, AgendamentosSaida, PedidoIdParams,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const agendamentoRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoAgendamento(app.pool)
  const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
  // Agenda e agendar sao operacao do kanban: quem gerencia pedidos.
  const operar = [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')]

  app.get('/', {
    ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: operar,
    schema: { querystring: AgendamentosEntrada, response: { 200: AgendamentosSaida } },
  }, async (req) => svc.listar(ator(req), req.query))

  app.get('/:pedido_id', {
    ...loja(), preHandler: operar,
    schema: { params: PedidoIdParams, response: { 200: AgendamentoSaida } },
  }, async (req) => svc.detalhe(ator(req), req.params.pedido_id))

  app.put('/:pedido_id', {
    ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: operar,
    schema: { params: PedidoIdParams, body: AgendamentoDefinirEntrada, response: { 200: AgendamentoSaida } },
  }, async (req) => svc.definir(ator(req), req.params.pedido_id, req.body))

  app.delete('/:pedido_id', {
    ...loja(), preHandler: operar,
    schema: { params: PedidoIdParams, response: { 200: AgendamentoSaida } },
  }, async (req) => svc.limpar(ator(req), req.params.pedido_id))
}
