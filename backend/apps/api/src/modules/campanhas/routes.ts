import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoCampanhas, type Ator } from './service'
import {
  CampanhaCancelarSaida, CampanhaDestinatariosSaida, CampanhaDetalheSaida, CampanhaDisparoSaida,
  CampanhaEntrada, CampanhaItem, CampanhasSaida, IdParams,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query); SEC-110. */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const campanhasRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoCampanhas(app.pool)
  const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
  // Campanha e marketing: gerir e privilegio de dono/gerente (`campanhas:gerir`), nunca do atendente.
  const ver = [app.autenticar, app.escopoLoja, app.exigirPermissao('campanhas:ver')]
  const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('campanhas:gerir')]

  app.get('/', {
    ...loja(), preHandler: ver,
    schema: { response: { 200: CampanhasSaida } },
  }, async (req) => svc.listar(ator(req)))

  app.post('/', {
    ...loja({ rateLimit: { max: 30, timeWindow: '1 minute' } }), preHandler: gerir,
    schema: { body: CampanhaEntrada, response: { 201: CampanhaItem } },
  }, async (req, reply) => {
    const c = await svc.criar(ator(req), req.body)
    reply.code(201)
    return c
  })

  app.get('/:id', {
    ...loja(), preHandler: ver,
    schema: { params: IdParams, response: { 200: CampanhaDetalheSaida } },
  }, async (req) => svc.detalhe(ator(req), req.params.id))

  app.get('/:id/destinatarios', {
    ...loja(), preHandler: ver,
    schema: { params: IdParams, response: { 200: CampanhaDestinatariosSaida } },
  }, async (req) => svc.destinatarios(ator(req), req.params.id))

  app.post('/:id/disparar', {
    ...loja({ rateLimit: { max: 10, timeWindow: '1 minute' } }), preHandler: gerir,
    schema: { params: IdParams, response: { 200: CampanhaDisparoSaida } },
  }, async (req) => svc.disparar(ator(req), req.params.id))

  app.post('/:id/cancelar', {
    ...loja({ rateLimit: { max: 30, timeWindow: '1 minute' } }), preHandler: gerir,
    schema: { params: IdParams, response: { 200: CampanhaCancelarSaida } },
  }, async (req) => svc.cancelar(ator(req), req.params.id))
}
