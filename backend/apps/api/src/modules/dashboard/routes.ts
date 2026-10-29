import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { escopoPermite } from '../../shared/tenant'
import { criarServicoDashboard, type Ator } from './service'
import {
  AtendimentoSaude, DashboardFiltro, DashboardGeral, DashboardResumo, SeriePorDia, SeriePorHora,
  TopItensFiltro, TopItensSaida,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, verFinanceiro: escopoPermite(e, 'relatorios:ver') }
}

export function criarDashboardRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoDashboard(app.pool)
    const cfg = { config: { acesso: 'conteudo_de_loja' as const, rateLimit: { max: 120, timeWindow: '1 minute' } } }
    const guarda = [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')]

    app.get('/resumo', {
      ...cfg, preHandler: guarda,
      schema: { querystring: DashboardFiltro, response: { 200: DashboardResumo } },
    }, async (req) => svc.resumo(ator(req), req.query))

    app.get('/serie-diaria', {
      ...cfg, preHandler: guarda,
      schema: { querystring: DashboardFiltro, response: { 200: SeriePorDia } },
    }, async (req) => svc.serieDiaria(ator(req), req.query))

    app.get('/por-hora', {
      ...cfg, preHandler: guarda,
      schema: { querystring: DashboardFiltro, response: { 200: SeriePorHora } },
    }, async (req) => svc.porHora(ator(req), req.query))

    app.get('/top-itens', {
      ...cfg, preHandler: guarda,
      schema: { querystring: TopItensFiltro, response: { 200: TopItensSaida } },
    }, async (req) => svc.topItens(ator(req), req.query))

    app.get('/atendimento', {
      ...cfg, preHandler: guarda,
      schema: { querystring: DashboardFiltro, response: { 200: AtendimentoSaude } },
    }, async (req) => svc.atendimento(ator(req), req.query))

    // Tudo do dashboard numa chamada so (resumo + series + top itens + atendimento), para a pagina
    // nao disparar cinco requisicoes em paralelo. O querystring usa o filtro de top itens (inclui
    // `limite`), que e superconjunto do filtro das demais metricas.
    app.get('/geral', {
      ...cfg, preHandler: guarda,
      schema: { querystring: TopItensFiltro, response: { 200: DashboardGeral } },
    }, async (req) => svc.geral(ator(req), req.query))
  }
}

/** Plugin do registry. */
export const dashboardRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarDashboardRoutes()(instancia, opts)
