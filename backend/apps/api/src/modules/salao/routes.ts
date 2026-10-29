import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoSalao, type Ator } from './service'
import {
  ComandaAbrirEntrada, ComandaFecharEntrada, ComandaItemEntrada, ComandaSaida, IdParams,
  MesaAtualizarEntrada, MesaCriarEntrada, MesaListaSaida, MesaSaida,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export function criarSalaoRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoSalao(app.pool)
    const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
    // Cadastro de mesa = config da loja; operar comandas = turno (como o kanban de pedidos).
    const gerirLoja = [app.autenticar, app.escopoLoja, app.exigirPermissao('salao:gerir')]
    const ver = [app.autenticar, app.escopoLoja, app.exigirPermissao('salao:ver')]
    const operar = [app.autenticar, app.escopoLoja, app.exigirPermissao('salao:operar')]

    // ---------------------------------------------------------------- mesas (cadastro)
    app.get('/mesas', {
      ...loja(), preHandler: ver,
      schema: { response: { 200: MesaListaSaida } },
    }, async (req) => svc.listarMesas(ator(req)))

    app.post('/mesas', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerirLoja,
      schema: { body: MesaCriarEntrada, response: { 201: MesaSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criarMesa(ator(req), req.body)))

    app.patch('/mesas/:id', {
      ...loja(), preHandler: gerirLoja,
      schema: { params: IdParams, body: MesaAtualizarEntrada, response: { 200: MesaSaida } },
    }, async (req) => svc.atualizarMesa(ator(req), req.params.id, req.body))

    // ------------------------------------------------------------- comandas (operacao)
    app.post('/comandas', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: operar,
      schema: { body: ComandaAbrirEntrada, response: { 201: ComandaSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.abrirComanda(ator(req), req.body)))

    app.get('/comandas/:id', {
      ...loja(), preHandler: ver,
      schema: { params: IdParams, response: { 200: ComandaSaida } },
    }, async (req) => svc.detalheComanda(ator(req), req.params.id))

    app.post('/comandas/:id/itens', {
      ...loja(), preHandler: operar,
      schema: { params: IdParams, body: ComandaItemEntrada, response: { 200: ComandaSaida } },
    }, async (req) => svc.lancarItem(ator(req), req.params.id, req.body))

    app.post('/comandas/:id/fechar', {
      ...loja(), preHandler: operar,
      schema: { params: IdParams, body: ComandaFecharEntrada, response: { 200: ComandaSaida } },
    }, async (req) => svc.fecharComanda(ator(req), req.params.id, req.body))
  }
}

/** Plugin do registry: salao nao tem dependencia de segredo (sem PII). */
export const salaoRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarSalaoRoutes()(instancia, opts)
