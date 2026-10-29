import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { regraNegocio } from '../../shared/http_errors'
import { criarServicoEstoque, type Ator } from './service'
import {
  EstoqueBuscaEntrada, EstoqueControleEntrada, EstoqueItemSaida, EstoqueListaSaida,
  EstoqueMovimentoEntrada, EstoqueMovimentoSaida, EstoqueMovimentosSaida, ParamId,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw regraNegocio('loja_ativa_obrigatoria', 'Informe a loja ativa no header x-loja-id')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const estoqueItensRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoEstoque(app.pool)
  const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
  // Leitura do estoque: rotina de salao (inclui atendente) -> permissao estoque_itens:ver.
  const leitura = [app.autenticar, app.escopoLoja, app.exigirPermissao('estoque_itens:ver')]
  // Escrita (ligar controle, lancar movimento): gestao da loja -> permissao estoque_itens:gerir.
  const escrita = [app.autenticar, app.escopoLoja, app.exigirPermissao('estoque_itens:gerir')]

  app.get('/', {
    ...loja(), preHandler: leitura,
    schema: { querystring: EstoqueBuscaEntrada, response: { 200: EstoqueListaSaida } },
  }, async (req) => svc.listar(ator(req), req.query))

  app.get('/:id', {
    ...loja(), preHandler: leitura,
    schema: { params: ParamId, response: { 200: EstoqueItemSaida } },
  }, async (req) => svc.detalhe(ator(req), req.params.id))

  app.get('/:id/movimentos', {
    ...loja(), preHandler: leitura,
    schema: { params: ParamId, response: { 200: EstoqueMovimentosSaida } },
  }, async (req) => svc.historico(ator(req), req.params.id))

  app.patch('/:id/controle', {
    ...loja(), preHandler: escrita,
    schema: { params: ParamId, body: EstoqueControleEntrada, response: { 200: EstoqueItemSaida } },
  }, async (req) => svc.definirControle(ator(req), req.params.id, req.body))

  app.post('/:id/movimentos', {
    ...loja(), preHandler: escrita,
    schema: { params: ParamId, body: EstoqueMovimentoEntrada, response: { 201: EstoqueMovimentoSaida } },
  }, async (req, reply) =>
    reply.status(201).send(await svc.movimentar(ator(req), req.params.id, req.body)))
}
