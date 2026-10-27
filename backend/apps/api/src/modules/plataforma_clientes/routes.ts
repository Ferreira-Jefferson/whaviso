import type { FastifyPluginAsync, FastifyRequest, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { naoAutorizado, proibido } from '../../shared/http_errors'
import { criarServicoPlataformaClientes, type AtorOperador } from './service'
import {
  IdParams, OperadorConvite, OperadorDTO, OperadorListaSaida, OperadorPatch,
  PlataformaContaFicha, PlataformaContaPagina, PlataformaContasQuery,
} from './schemas'

/** Operador efetivo = SO o do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): AtorOperador {
  const o = req.operador
  if (!o) throw naoAutorizado()
  return { userId: o.user_id, papel: o.papel }
}

/** Escrita da equipe: so `admin` (SEC-041). Roda depois de `escopoOperador`. */
const exigirAdmin: preHandlerHookHandler = async (req) => {
  if (ator(req).papel !== 'admin') throw proibido('Apenas admin gere a equipe da plataforma')
}

export function criarPlataformaClientesRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoPlataformaClientes(app.pool)
    // Toda rota e 'plataforma' (escopo de operador); membro de loja recebe 403 do escopoOperador.
    const plataforma = (extra: object = {}) => ({ config: { acesso: 'plataforma' as const, ...extra } })
    const leitura = [app.autenticar, app.escopoOperador]
    const escritaAdmin = [app.autenticar, app.escopoOperador, exigirAdmin]

    app.get('/contas', {
      ...plataforma(), preHandler: leitura,
      schema: { querystring: PlataformaContasQuery, response: { 200: PlataformaContaPagina } },
    }, async (req) => svc.listarContas(req.query))

    app.get('/contas/:id', {
      ...plataforma(), preHandler: leitura,
      schema: { params: IdParams, response: { 200: PlataformaContaFicha } },
    }, async (req) => svc.fichaConta(req.params.id))

    app.get('/operadores', {
      ...plataforma(), preHandler: escritaAdmin,
      schema: { response: { 200: OperadorListaSaida } },
    }, async () => svc.listarOperadores())

    app.post('/operadores', {
      ...plataforma({ rateLimit: { max: 30, timeWindow: '1 minute' } }), preHandler: escritaAdmin,
      schema: { body: OperadorConvite, response: { 201: OperadorDTO } },
    }, async (req, reply) => reply.status(201).send(await svc.criarOperador(ator(req), req.body)))

    app.patch('/operadores/:id', {
      ...plataforma({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: escritaAdmin,
      schema: { params: IdParams, body: OperadorPatch, response: { 200: OperadorDTO } },
    }, async (req) => svc.alterarOperador(ator(req), req.params.id, req.body))
  }
}

/** Plugin do registry: sem dependencia de segredo (sem PII). */
export const plataformaClientesRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarPlataformaClientesRoutes()(instancia, opts)
