import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoRelatorios, type Ator } from './service'
import {
  CancelamentosFiltro, CancelamentosSaida, CoortesSaida, DimensoesSaida, FormasPagamentoSaida, RelatorioPeriodo,
  SalaoSaida, VendasConsulta, VendasSaida,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa }
}

export function criarRelatoriosRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoRelatorios(app.pool)
    // Agregacoes mais pesadas que o dashboard: limite menor por minuto.
    const cfg = { config: { acesso: 'conteudo_de_loja' as const, rateLimit: { max: 60, timeWindow: '1 minute' } } }
    const guarda = [app.autenticar, app.escopoLoja, app.exigirPermissao('relatorios:ver')]

    // Montador flexivel: POST para carregar o array de filtros no corpo (leitura, sem efeito).
    app.post('/vendas', {
      ...cfg, preHandler: guarda,
      schema: { body: VendasConsulta, response: { 200: VendasSaida } },
    }, async (req) => svc.vendas(ator(req), req.body))

    app.get('/dimensoes', {
      ...cfg, preHandler: guarda,
      schema: { response: { 200: DimensoesSaida } },
    }, async (req) => svc.dimensoes(ator(req)))

    app.get('/salao', {
      ...cfg, preHandler: guarda,
      schema: { querystring: RelatorioPeriodo, response: { 200: SalaoSaida } },
    }, async (req) => svc.salao(ator(req), req.query))

    app.get('/formas-pagamento', {
      ...cfg, preHandler: guarda,
      schema: { querystring: RelatorioPeriodo, response: { 200: FormasPagamentoSaida } },
    }, async (req) => svc.formasPagamento(ator(req), req.query))

    app.get('/cancelamentos', {
      ...cfg, preHandler: guarda,
      schema: { querystring: CancelamentosFiltro, response: { 200: CancelamentosSaida } },
    }, async (req) => svc.cancelamentos(ator(req), req.query))

    app.get('/coortes', {
      ...cfg, preHandler: guarda,
      schema: { querystring: RelatorioPeriodo, response: { 200: CoortesSaida } },
    }, async (req) => svc.coortes(ator(req), req.query))
  }
}

/** Plugin do registry. */
export const relatoriosRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarRelatoriosRoutes()(instancia, opts)
