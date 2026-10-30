import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { criarServicoEvals } from './service'
import {
  EvalBaselineDefinir, EvalCaso, EvalCasoAtualizar, EvalCasoCriar, EvalCasoLista, EvalComparacao,
  EvalComparar, EvalExecucao, EvalExecucaoCriar, EvalExecucaoDetalhe, EvalExecucaoFiltro,
  EvalExecucaoLista, EvalSuite, EvalSuiteAtualizar, EvalSuiteCriar, EvalSuiteLista, IdParam,
  LojasAlvoLista, SuitesQuery,
} from './schemas'

/** Rotas de operador da plataforma (`acesso: 'plataforma'`): membro de loja recebe 403. */
export function criarPlataformaEvalsRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoEvals(app.pool)
    const ver = () => ({
      config: { acesso: 'plataforma' as const },
      preHandler: [app.autenticar, app.escopoOperador, app.exigirPermissao('evals:ver')],
    })
    const rodar = () => ({
      config: { acesso: 'plataforma' as const },
      preHandler: [app.autenticar, app.escopoOperador, app.exigirPermissao('evals:rodar')],
    })

    app.get('/suites', { ...ver(), schema: { querystring: SuitesQuery, response: { 200: EvalSuiteLista } } },
      async (req) => svc.listarSuites(req.query.ativo))
    app.post('/suites', { ...rodar(), schema: { body: EvalSuiteCriar, response: { 200: EvalSuite } } },
      async (req) => svc.criarSuite(req.body))
    app.patch('/suites/:id', {
      ...rodar(), schema: { params: IdParam, body: EvalSuiteAtualizar, response: { 200: EvalSuite } },
    }, async (req) => svc.atualizarSuite(req.params.id, req.body))

    app.get('/suites/:id/casos', {
      ...ver(), schema: { params: IdParam, response: { 200: EvalCasoLista } },
    }, async (req) => svc.listarCasos(req.params.id))
    app.post('/suites/:id/casos', {
      ...rodar(), schema: { params: IdParam, body: EvalCasoCriar, response: { 200: EvalCaso } },
    }, async (req) => svc.criarCaso(req.params.id, req.body))
    app.patch('/casos/:id', {
      ...rodar(), schema: { params: IdParam, body: EvalCasoAtualizar, response: { 200: EvalCaso } },
    }, async (req) => svc.atualizarCaso(req.params.id, req.body))

    // Seletor da loja alvo (ferramenta de operador: todas as lojas, so id e nome).
    app.get('/lojas-alvo', { ...ver(), schema: { response: { 200: LojasAlvoLista } } },
      async () => svc.listarLojasAlvo())

    app.post('/execucoes', { ...rodar(), schema: { body: EvalExecucaoCriar, response: { 200: EvalExecucao } } },
      async (req) => svc.enfileirar(req.body, req.operador?.user_id ?? ''))
    app.get('/execucoes', {
      ...ver(), schema: { querystring: EvalExecucaoFiltro, response: { 200: EvalExecucaoLista } },
    }, async (req) => svc.listarExecucoes(req.query))
    app.post('/execucoes/comparar', {
      ...ver(), schema: { body: EvalComparar, response: { 200: EvalComparacao } },
    }, async (req) => svc.comparar(req.body.execucaoA, req.body.execucaoB))
    app.post('/execucoes/baseline', {
      ...rodar(), schema: { body: EvalBaselineDefinir, response: { 200: EvalExecucao } },
    }, async (req) => svc.definirBaseline(req.body))
    app.get('/execucoes/:id', {
      ...ver(), schema: { params: IdParam, response: { 200: EvalExecucaoDetalhe } },
    }, async (req) => svc.detalhe(req.params.id))
    app.post('/execucoes/:id/cancelar', {
      ...rodar(), schema: { params: IdParam, response: { 200: EvalExecucao } },
    }, async (req) => svc.cancelar(req.params.id))
  }
}

/** Plugin do registry. */
export const plataformaEvalsRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarPlataformaEvalsRoutes()(instancia, opts)
