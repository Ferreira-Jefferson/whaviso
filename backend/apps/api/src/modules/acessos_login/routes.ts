// Rotas /v1/acessos-login/* (console do OPERADOR, equipe Whaviso). Gestao da allowlist de login:
// listar, adicionar, aprovar (enfileira boas-vindas) e revogar e-mails. Guardada pela permissao
// JA EXISTENTE `cobranca:gerir` (nao cria permissao nova). O user_id vem SO do escopo de operador.
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { proibido } from '../../shared/http_errors'
import { criarServicoAcessosLogin, type Ator } from './service'
import { AcessoAdicionar, AcessoDTO, AcessosLista, AcessosQuery, IdParams, MinhaElegibilidade } from './schemas'

/** Ator = operador autenticado. O user_id vem SO do escopo resolvido (nunca do corpo/query). */
function operador(req: FastifyRequest): Ator {
  const o = req.operador
  if (!o) throw proibido('Escopo de operador ausente')
  return { userId: o.user_id }
}

export function criarAcessosLoginRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoAcessosLogin(app.pool)

    // Rotas de PLATAFORMA (operador). O plugin de escopo bloqueia por padrao; a permissao
    // `cobranca:gerir` (grade editavel) roda depois do escopo de operador.
    const plataforma = {
      config: { acesso: 'plataforma' as const },
      preHandler: [app.autenticar, app.escopoOperador, app.exigirPermissao('cobranca:gerir')],
    }

    app.get('/', {
      ...plataforma,
      schema: { querystring: AcessosQuery, response: { 200: AcessosLista } },
    }, async (req) => svc.listar(operador(req), req.query.status))

    // Elegibilidade do PROPRIO usuario (sonda da porta de entrada do painel). Qualquer autenticado
    // pode perguntar o proprio estado; nao usa escopo de loja nem de operador (um recem-aprovado
    // ainda nao tem loja, e a resposta e so sobre o e-mail do caller). Nao vaza status de terceiros.
    app.get('/eu', {
      config: { acesso: 'conteudo_de_loja' as const },
      preHandler: [app.autenticar],
      schema: { response: { 200: MinhaElegibilidade } },
    }, async (req) => {
      const u = req.usuario
      if (!u) throw proibido('Nao autenticado')
      return svc.minhaElegibilidade(u.user_id)
    })

    app.post('/', {
      ...plataforma,
      schema: { body: AcessoAdicionar, response: { 201: AcessoDTO } },
    }, async (req, reply) => reply.status(201).send(await svc.adicionar(operador(req), req.body)))

    app.post('/:id/aprovar', {
      ...plataforma,
      schema: { params: IdParams, response: { 200: AcessoDTO } },
    }, async (req) => svc.aprovar(operador(req), req.params.id))

    app.post('/:id/revogar', {
      ...plataforma,
      schema: { params: IdParams, response: { 200: AcessoDTO } },
    }, async (req) => svc.revogar(operador(req), req.params.id))
  }
}

/** Plugin do registry. */
export const acessosLoginRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarAcessosLoginRoutes()(instancia, opts)
