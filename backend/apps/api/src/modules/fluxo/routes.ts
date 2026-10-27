import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoFluxo, type Ator } from './service'
import {
  FluxoCatalogoSaida, FluxoCriarEntrada, FluxoRascunhoEntrada, FluxoSaida, FluxosSaida,
  FluxoValidacaoSaida, FluxoVersaoSaida, FluxoVersoesSaida, IdParams, VersaoParams,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const fluxoRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoFluxo(app.pool)
  const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
  // Leitura: qualquer papel da loja (atendente so le). Editar e publicar: dono/gerente (loja:gerir).
  const ler = [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')]
  const editar = [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]
  const limite = { rateLimit: { max: 60, timeWindow: '1 minute' } }

  app.get('/catalogo', {
    ...loja(), preHandler: ler, schema: { response: { 200: FluxoCatalogoSaida } },
  }, async () => svc.catalogo())

  app.get('/', {
    ...loja(), preHandler: ler, schema: { response: { 200: FluxosSaida } },
  }, async (req) => svc.listar(ator(req)))

  app.post('/', {
    ...loja(limite), preHandler: editar,
    schema: { body: FluxoCriarEntrada, response: { 201: FluxoSaida } },
  }, async (req, reply) => reply.status(201).send(await svc.criar(ator(req), req.body)))

  app.get('/:id', {
    ...loja(), preHandler: ler, schema: { params: IdParams, response: { 200: FluxoSaida } },
  }, async (req) => svc.detalhe(ator(req), req.params.id))

  app.put('/:id/rascunho', {
    ...loja(limite), preHandler: editar,
    schema: { params: IdParams, body: FluxoRascunhoEntrada, response: { 200: FluxoSaida } },
  }, async (req) => svc.salvarRascunho(ator(req), req.params.id, req.body))

  app.post('/:id/rascunho/validar', {
    ...loja(limite), preHandler: editar,
    schema: { params: IdParams, response: { 200: FluxoValidacaoSaida } },
  }, async (req) => svc.validarRascunho(ator(req), req.params.id))

  app.post('/:id/rascunho/publicar', {
    ...loja(limite), preHandler: editar,
    schema: { params: IdParams, response: { 200: FluxoSaida } },
  }, async (req) => svc.publicar(ator(req), req.params.id))

  app.post('/:id/ativar', {
    ...loja(limite), preHandler: editar, schema: { params: IdParams, response: { 200: FluxoSaida } },
  }, async (req) => svc.definirAtivo(ator(req), req.params.id, true))

  app.post('/:id/desativar', {
    ...loja(limite), preHandler: editar, schema: { params: IdParams, response: { 200: FluxoSaida } },
  }, async (req) => svc.definirAtivo(ator(req), req.params.id, false))

  app.get('/:id/versoes', {
    ...loja(), preHandler: ler, schema: { params: IdParams, response: { 200: FluxoVersoesSaida } },
  }, async (req) => svc.listarVersoes(ator(req), req.params.id))

  app.get('/:id/versoes/:versao', {
    ...loja(), preHandler: ler, schema: { params: VersaoParams, response: { 200: FluxoVersaoSaida } },
  }, async (req) => svc.obterVersao(ator(req), req.params.id, req.params.versao))

  app.post('/:id/versoes/:versao/restaurar', {
    ...loja(limite), preHandler: editar,
    schema: { params: VersaoParams, response: { 200: FluxoSaida } },
  }, async (req) => svc.restaurar(ator(req), req.params.id, req.params.versao))
}
