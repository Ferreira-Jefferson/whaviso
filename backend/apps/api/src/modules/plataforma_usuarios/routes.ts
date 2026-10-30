import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { naoAutorizado } from '../../shared/http_errors'
import { criarServicoPlataformaUsuarios, type AtorOperador } from './service'
import {
  IdParams, NovoUsuario, NovoUsuarioSaida, OperadorConvite, OperadorDTO, OperadorListaSaida, OperadorPatch,
  PlataformaContaFicha, PlataformaContaPagina, PlataformaContasQuery,
} from './schemas'

/** Operador efetivo = SO o do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): AtorOperador {
  const o = req.operador
  if (!o) throw naoAutorizado()
  return { userId: o.user_id, papel: o.papel }
}

export function criarPlataformaUsuariosRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoPlataformaUsuarios(app.pool)
    // Toda rota e 'plataforma' (escopo de operador); membro de loja recebe 403 do escopoOperador.
    const plataforma = (extra: object = {}) => ({ config: { acesso: 'plataforma' as const, ...extra } })
    // Permissoes da grade (padrao: so admin cadastra usuario e gere a equipe; SEC-041). Rodam depois de `escopoOperador`.
    const leitura = [app.autenticar, app.escopoOperador, app.exigirPermissao('usuarios_plataforma:ver')]
    const criarUsuario = [app.autenticar, app.escopoOperador, app.exigirPermissao('usuarios_plataforma:criar')]
    const equipe = [app.autenticar, app.escopoOperador, app.exigirPermissao('equipe:gerir')]

    app.get('/contas', {
      ...plataforma(), preHandler: leitura,
      schema: { querystring: PlataformaContasQuery, response: { 200: PlataformaContaPagina } },
    }, async (req) => svc.listarContas(req.query))

    app.get('/contas/:id', {
      ...plataforma(), preHandler: leitura,
      schema: { params: IdParams, response: { 200: PlataformaContaFicha } },
    }, async (req) => svc.fichaConta(req.params.id))

    app.post('/usuarios', {
      ...plataforma({ rateLimit: { max: 20, timeWindow: '1 minute' } }), preHandler: criarUsuario,
      schema: { body: NovoUsuario, response: { 201: NovoUsuarioSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criarUsuario(ator(req), req.body)))

    app.get('/operadores', {
      ...plataforma(), preHandler: equipe,
      schema: { response: { 200: OperadorListaSaida } },
    }, async () => svc.listarOperadores())

    app.post('/operadores', {
      ...plataforma({ rateLimit: { max: 30, timeWindow: '1 minute' } }), preHandler: equipe,
      schema: { body: OperadorConvite, response: { 201: OperadorDTO } },
    }, async (req, reply) => reply.status(201).send(await svc.criarOperador(ator(req), req.body)))

    app.patch('/operadores/:id', {
      ...plataforma({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: equipe,
      schema: { params: IdParams, body: OperadorPatch, response: { 200: OperadorDTO } },
    }, async (req) => svc.alterarOperador(ator(req), req.params.id, req.body))
  }
}

/** Plugin do registry: sem dependencia de segredo (sem PII). */
export const plataformaUsuariosRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarPlataformaUsuariosRoutes()(instancia, opts)
