import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import {
  IdParams,
  ResolverZonaEntrada,
  ResolverZonaSaida,
  ZonaAtualizarEntrada,
  ZonaEntrada,
  ZonaListaQuery,
  ZonaListaSaida,
  ZonaLoteEntrada,
  ZonaSaida,
} from './schemas'
import * as service from './service'
import type { Ator } from './service'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const zonasEntregaRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const config = { acesso: 'conteudo_de_loja' as const }
  // Ler e resolver: qualquer papel da loja (o atendente precifica a entrega na conversa).
  const ler = { config, preHandler: [app.autenticar, app.escopoLoja] }
  // Escrever: configuracao da loja (dono e gerente).
  const gerir = { config, preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')] }

  app.get(
    '/',
    { ...ler, schema: { querystring: ZonaListaQuery, response: { 200: ZonaListaSaida } } },
    async (req) => service.listar(app.pool, ator(req), req.query.incluir_inativas === 'true'),
  )

  app.post(
    '/',
    { ...gerir, schema: { body: ZonaEntrada, response: { 201: ZonaSaida } } },
    async (req, reply) => reply.status(201).send(await service.criar(app.pool, ator(req), req.body)),
  )

  // Importacao rapida de bairros com valores padrao. Rota literal tem precedencia sobre /:id.
  app.post(
    '/lote',
    { ...gerir, schema: { body: ZonaLoteEntrada, response: { 201: ZonaListaSaida } } },
    async (req, reply) => reply.status(201).send(await service.criarLote(app.pool, ator(req), req.body)),
  )

  app.post(
    '/resolver',
    { ...ler, schema: { body: ResolverZonaEntrada, response: { 200: ResolverZonaSaida } } },
    async (req) => service.resolver(app.pool, ator(req), req.body),
  )

  app.get(
    '/:id',
    { ...ler, schema: { params: IdParams, response: { 200: ZonaSaida } } },
    async (req) => service.obter(app.pool, ator(req), req.params.id),
  )

  app.patch(
    '/:id',
    { ...gerir, schema: { params: IdParams, body: ZonaAtualizarEntrada, response: { 200: ZonaSaida } } },
    async (req) => service.atualizar(app.pool, ator(req), req.params.id, req.body),
  )

  app.post(
    '/:id/ativar',
    { ...gerir, schema: { params: IdParams, response: { 200: ZonaSaida } } },
    async (req) => service.alterarAtivo(app.pool, ator(req), req.params.id, true),
  )

  app.post(
    '/:id/desativar',
    { ...gerir, schema: { params: IdParams, response: { 200: ZonaSaida } } },
    async (req) => service.alterarAtivo(app.pool, ator(req), req.params.id, false),
  )
}
