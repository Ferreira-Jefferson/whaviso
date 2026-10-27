import { z } from 'zod'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoEstoque, type Ator } from './service'
import {
  InsumoBaixoEstoqueSaida, IdParams, InsumoAtualizarEntrada, InsumoCriarEntrada, InsumoListaSaida,
  InsumoSaida, MovimentoInsumoAplicadoSaida, MovimentoInsumoEntrada, MovimentoInsumoListaSaida,
  MovimentosInsumoBuscaEntrada,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

const ListaQuery = z.strictObject({
  incluir_inativos: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

export function criarEstoqueRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoEstoque(app.pool)
    const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
    // Insumos = configuracao/operacao da loja (como cardapio, zonas, motoboys): dono e gerente.
    const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]

    app.get('/', {
      ...loja(), preHandler: gerir,
      schema: { querystring: ListaQuery, response: { 200: InsumoListaSaida } },
    }, async (req) => svc.listar(ator(req), req.query.incluir_inativos))

    app.get('/baixo-estoque', {
      ...loja(), preHandler: gerir,
      schema: { response: { 200: InsumoBaixoEstoqueSaida } },
    }, async (req) => svc.baixoEstoque(ator(req)))

    app.post('/', {
      ...loja(), preHandler: gerir,
      schema: { body: InsumoCriarEntrada, response: { 201: InsumoSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criar(ator(req), req.body)))

    app.get('/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, response: { 200: InsumoSaida } },
    }, async (req) => svc.detalhe(ator(req), req.params.id))

    app.patch('/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, body: InsumoAtualizarEntrada, response: { 200: InsumoSaida } },
    }, async (req) => svc.atualizar(ator(req), req.params.id, req.body))

    app.get('/:id/movimentos', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, querystring: MovimentosInsumoBuscaEntrada, response: { 200: MovimentoInsumoListaSaida } },
    }, async (req) => svc.movimentos(ator(req), req.params.id, req.query.limite))

    // Lanca entrada/saida/ajuste. O insumo_id vai no corpo (validado contra a loja no service).
    app.post('/movimentos', {
      ...loja(), preHandler: gerir,
      schema: { body: MovimentoInsumoEntrada, response: { 201: MovimentoInsumoAplicadoSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.movimentar(ator(req), req.body)))
  }
}

/** Plugin do registry. */
export const estoqueInsumosRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarEstoqueRoutes()(instancia, opts)
