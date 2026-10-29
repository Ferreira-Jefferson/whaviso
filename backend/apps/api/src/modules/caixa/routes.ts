import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoCaixa, type Ator } from './service'
import {
  CaixaAbrirEntrada, CaixaFecharEntrada, CaixaRelatorioSaida, CaixaSaida, IdParams, MovimentoEntrada,
  MovimentoSaida, SessaoAbertaSaida,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export function criarCaixaRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoCaixa(app.pool)
    const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
    const ver = [app.autenticar, app.escopoLoja, app.exigirPermissao('caixa:ver')]
    const guarda = [app.autenticar, app.escopoLoja, app.exigirPermissao('caixa:gerir')]

    app.post('/abrir', {
      ...loja(), preHandler: guarda,
      schema: { body: CaixaAbrirEntrada, response: { 201: CaixaSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.abrir(ator(req), req.body)))

    app.get('/aberto', {
      ...loja(), preHandler: ver,
      schema: { response: { 200: SessaoAbertaSaida } },
    }, async (req) => svc.sessaoAberta(ator(req)))

    app.post('/:id/movimentos', {
      ...loja({ rateLimit: { max: 120, timeWindow: '1 minute' } }), preHandler: guarda,
      schema: { params: IdParams, body: MovimentoEntrada, response: { 201: MovimentoSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.registrar(ator(req), req.params.id, req.body)))

    app.post('/:id/fechar', {
      ...loja(), preHandler: guarda,
      schema: { params: IdParams, body: CaixaFecharEntrada, response: { 200: CaixaSaida } },
    }, async (req) => svc.fechar(ator(req), req.params.id, req.body))

    app.get('/:id/relatorio', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: ver,
      schema: { params: IdParams, response: { 200: CaixaRelatorioSaida } },
    }, async (req) => svc.relatorio(ator(req), req.params.id))
  }
}

/** Plugin do registry. */
export const caixaRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarCaixaRoutes()(instancia, opts)
