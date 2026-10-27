// Rotas do funil de aquisicao (/v1/plataforma-funil/*). SO operador da plataforma: toda rota e
// marcada `acesso: 'plataforma'` e passa por `escopoOperador` (membro de loja recebe 403). O
// operador que age vem do JWT (resolverAtor), nunca do corpo.
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { naoAutorizado } from '../../shared/http_errors'
import { cifraPadrao, type Cifra } from './cripto'
import { criarServicoFunil } from './service'
import {
  AgendaFollowUpLista,
  AgendaQuery,
  AtividadeCriar,
  AtividadeDTO,
  AtividadeListaQuery,
  AtividadePagina,
  EstagioMudar,
  FunilQuadro,
  IdParams,
  ProspectoCriar,
  ProspectoDetalheDTO,
  ProspectoListaQuery,
  ProspectoPagina,
  ProspectoPatch,
  QuadroQuery,
  VincularConta,
} from './schemas'

/** Fabrica do plugin; `cifra` injetavel (testes). Padrao: cifra da MASTER_KEY (lazy). */
export function criarPlataformaFunilRoutes(cifra?: Cifra): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoFunil(app.pool, cifra ?? cifraPadrao())
    const operador = (extra: object = {}) => ({
      config: { acesso: 'plataforma' as const, ...extra },
      preHandler: [app.autenticar, app.escopoOperador],
    })
    const ator = (req: FastifyRequest) => {
      if (!req.operador) throw naoAutorizado()
      return svc.resolverAtor(req.operador.user_id)
    }

    // --- Prospectos ---
    app.get('/prospectos', {
      ...operador(),
      schema: { querystring: ProspectoListaQuery, response: { 200: ProspectoPagina } },
    }, async (req) => svc.listar(req.query))

    app.post('/prospectos', {
      ...operador({ rateLimit: { max: 60, timeWindow: '1 minute' } }),
      schema: { body: ProspectoCriar, response: { 201: ProspectoDetalheDTO } },
    }, async (req, reply) => reply.status(201).send(await svc.criar(await ator(req), req.body)))

    // Detalhe: unico lugar que devolve o telefone em claro (para o operador ligar).
    app.get('/prospectos/:id', {
      ...operador({ rateLimit: { max: 120, timeWindow: '1 minute' } }),
      schema: { params: IdParams, response: { 200: ProspectoDetalheDTO } },
    }, async (req) => svc.detalhe(req.params.id))

    app.patch('/prospectos/:id', {
      ...operador(),
      schema: { params: IdParams, body: ProspectoPatch, response: { 200: ProspectoDetalheDTO } },
    }, async (req) => svc.atualizar(await ator(req), req.params.id, req.body))

    app.post('/prospectos/:id/estagio', {
      ...operador(),
      schema: { params: IdParams, body: EstagioMudar, response: { 200: ProspectoDetalheDTO } },
    }, async (req) => svc.mudarEstagio(await ator(req), req.params.id, req.body.estagio, req.body.motivo))

    app.post('/prospectos/:id/vincular-conta', {
      ...operador(),
      schema: { params: IdParams, body: VincularConta, response: { 200: ProspectoDetalheDTO } },
    }, async (req) => svc.vincularConta(await ator(req), req.params.id, req.body.conta_id))

    // --- Atividades (append-only) ---
    app.get('/prospectos/:id/atividades', {
      ...operador(),
      schema: { params: IdParams, querystring: AtividadeListaQuery, response: { 200: AtividadePagina } },
    }, async (req) => svc.listarAtividades(req.params.id, req.query.cursor, req.query.limite))

    app.post('/prospectos/:id/atividades', {
      ...operador(),
      schema: { params: IdParams, body: AtividadeCriar, response: { 201: AtividadeDTO } },
    }, async (req, reply) =>
      reply.status(201).send(await svc.criarAtividade(await ator(req), req.params.id, req.body)))

    // --- Funil ---
    app.get('/funil/quadro', {
      ...operador(),
      schema: { querystring: QuadroQuery, response: { 200: FunilQuadro } },
    }, async (req) => svc.quadro(req.query.limite_por_estagio))

    app.get('/funil/agenda', {
      ...operador(),
      schema: { querystring: AgendaQuery, response: { 200: AgendaFollowUpLista } },
    }, async (req) => svc.agenda(await ator(req), req.query))
  }
}

/** Plugin do registry: a cifra vem da MASTER_KEY da env (kernel @whaviso/shared/cifra). */
export const plataformaFunilRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarPlataformaFunilRoutes()(instancia, opts)
