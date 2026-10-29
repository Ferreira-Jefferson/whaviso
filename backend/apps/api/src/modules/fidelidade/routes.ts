import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoFidelidade, type Ator } from './service'
import {
  AcumularEntrada, AcumuloSaida, ClienteIdParams, MovimentosEntrada, MovimentosSaida, ProgramaEntrada,
  ProgramaSaida, ResgatarEntrada, ResgateSaida, SaldoSaida,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const fidelidadeRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoFidelidade(app.pool)
  const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
  // Configurar o programa e da gestao (dono/gerente). Operar o saldo no pedido: quem opera o turno.
  const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('fidelidade:gerir')]
  const ver = [app.autenticar, app.escopoLoja, app.exigirPermissao('fidelidade:ver')]
  const operar = [app.autenticar, app.escopoLoja, app.exigirPermissao('fidelidade:operar')]
  const limite = { rateLimit: { max: 60, timeWindow: '1 minute' } }

  app.get('/programa', {
    ...loja(), preHandler: ver,
    schema: { response: { 200: ProgramaSaida } },
  }, async (req) => svc.programa(ator(req)))

  app.put('/programa', {
    ...loja(limite), preHandler: gerir,
    schema: { body: ProgramaEntrada, response: { 200: ProgramaSaida } },
  }, async (req) => svc.salvarPrograma(ator(req), req.body))

  app.get('/clientes/:clienteId/saldo', {
    ...loja(), preHandler: ver,
    schema: { params: ClienteIdParams, response: { 200: SaldoSaida } },
  }, async (req) => svc.saldo(ator(req), req.params.clienteId))

  app.get('/clientes/:clienteId/movimentos', {
    ...loja(limite), preHandler: ver,
    schema: { params: ClienteIdParams, querystring: MovimentosEntrada, response: { 200: MovimentosSaida } },
  }, async (req) => svc.movimentos(ator(req), req.params.clienteId, req.query))

  app.post('/acumular', {
    ...loja(limite), preHandler: operar,
    schema: { body: AcumularEntrada, response: { 201: AcumuloSaida } },
  }, async (req, reply) => reply.status(201).send(await svc.acumular(ator(req), req.body)))

  app.post('/resgatar', {
    ...loja(limite), preHandler: operar,
    schema: { body: ResgatarEntrada, response: { 201: ResgateSaida } },
  }, async (req, reply) => reply.status(201).send(await svc.resgatar(ator(req), req.body)))
}
