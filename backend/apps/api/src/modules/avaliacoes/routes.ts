import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoAvaliacoes, type Ator } from './service'
import {
  AvaliacaoCriarEntrada, AvaliacaoSaida, AvaliacoesEntrada, AvaliacoesResumoSaida, AvaliacoesSaida, IdParams,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const avaliacoesRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoAvaliacoes(app.pool)
  const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
  // Leitura e agregados sao relatorio (dono/gerente). Registro interno: quem opera o turno.
  const ler = [app.autenticar, app.escopoLoja, app.exigirPermissao('relatorios:ver')]
  const operar = [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')]

  app.get('/', {
    ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: ler,
    schema: { querystring: AvaliacoesEntrada, response: { 200: AvaliacoesSaida } },
  }, async (req) => svc.listar(ator(req), req.query))

  app.get('/resumo', {
    ...loja(), preHandler: ler,
    schema: { response: { 200: AvaliacoesResumoSaida } },
  }, async (req) => svc.resumo(ator(req)))

  app.get('/:id', {
    ...loja(), preHandler: ler,
    schema: { params: IdParams, response: { 200: AvaliacaoSaida } },
  }, async (req) => svc.detalhe(ator(req), req.params.id))

  app.post('/', {
    ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: operar,
    schema: { body: AvaliacaoCriarEntrada, response: { 201: AvaliacaoSaida } },
  }, async (req, reply) => reply.status(201).send(await svc.registrar(ator(req), req.body)))
}
