import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoPromocoes, type Ator } from './service'
import {
  IdParams, PromocaoAtualizarEntrada, PromocaoCriarEntrada, PromocaoListaEntrada, PromocaoListaSaida,
  PromocaoSaida, PromocaoUsoEntrada, PromocaoUsoSaida, PromocaoValidarEntrada, PromocaoValidarSaida,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const promocoesRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoPromocoes(app.pool)
  const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
  // Gestao do catalogo (grade editavel; padrao dono/gerente). Consulta/aplicacao no fluxo de pedido: quem gere pedidos.
  const ver = [app.autenticar, app.escopoLoja, app.exigirPermissao('promocoes:ver')]
  const gestao = [app.autenticar, app.escopoLoja, app.exigirPermissao('promocoes:gerir')]
  const balcao = [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')]

  app.get('/', {
    ...loja(), preHandler: ver,
    schema: { querystring: PromocaoListaEntrada, response: { 200: PromocaoListaSaida } },
  }, async (req) => svc.listar(ator(req), req.query))

  app.post('/', {
    ...loja(), preHandler: gestao,
    schema: { body: PromocaoCriarEntrada, response: { 201: PromocaoSaida } },
  }, async (req, reply) => reply.status(201).send(await svc.criar(ator(req), req.body)))

  // Rotas fixas antes de /:id (o prefixo do modulo e unico).
  app.post('/validar', {
    ...loja({ rateLimit: { max: 120, timeWindow: '1 minute' } }), preHandler: balcao,
    schema: { body: PromocaoValidarEntrada, response: { 200: PromocaoValidarSaida } },
  }, async (req) => svc.validar(ator(req), req.body))

  app.post('/aplicar', {
    ...loja({ rateLimit: { max: 120, timeWindow: '1 minute' } }), preHandler: balcao,
    schema: { body: PromocaoValidarEntrada, response: { 200: PromocaoValidarSaida } },
  }, async (req) => svc.aplicar(ator(req), req.body))

  app.post('/usos', {
    ...loja(), preHandler: balcao,
    schema: { body: PromocaoUsoEntrada, response: { 200: PromocaoUsoSaida, 201: PromocaoUsoSaida } },
  }, async (req, reply) => {
    const r = await svc.registrarUso(ator(req), req.body)
    return reply.status(r.criado ? 201 : 200).send(r)
  })

  app.get('/:id', {
    ...loja(), preHandler: ver,
    schema: { params: IdParams, response: { 200: PromocaoSaida } },
  }, async (req) => svc.detalhe(ator(req), req.params.id))

  app.patch('/:id', {
    ...loja(), preHandler: gestao,
    schema: { params: IdParams, body: PromocaoAtualizarEntrada, response: { 200: PromocaoSaida } },
  }, async (req) => svc.atualizar(ator(req), req.params.id, req.body))
}
