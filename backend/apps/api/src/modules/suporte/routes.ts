// Rotas HTTP do modulo `suporte`. Dois plugins (um prefixo cada no registry):
//   - suporteRoutes          -> /v1/suporte/*            (LOJA; escopo de loja + suporte_loja:gerir)
//   - plataformaSuporteRoutes -> /v1/plataforma-suporte/* (CONSOLE; operador + suporte_plataforma:*)
//
// A loja efetiva na LOJA vem do escopo (`req.escopo.loja_ativa`), nunca do corpo (SEC-002); no
// CONSOLE a loja alvo vem SEMPRE de parametro de ROTA (`:lojaId`). SEC-003: o console le a
// correspondencia de suporte (permitido), mas NAO devolve conteudo de loja (conversa/pedido/
// cliente); isso fica para a PONTE de acesso assistido, fora deste modulo.
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { naoAutorizado, proibido } from '../../shared/http_errors'
import { criarServicoSuporte } from './service'
import {
  AcessoSuporte, ChamadoFicha, ChamadoMensagem, ChamadoPagina, ChamadoResumo, IdParams,
  ListaAcessos, ListaChamados, LojaIdParams, NovaMensagem, NovoAcesso, NovoChamado, PatchChamado,
  SuporteChamadosQuery,
} from './schemas'

const ACESSO_LOJA = 'conteudo_de_loja' as const
const SENSIVEL = { max: 20, timeWindow: '1 minute' }

/** Loja ativa garantida: `escopoLoja` + `exigirPermissao` ja rodaram no preHandler. */
function lojaAtiva(req: FastifyRequest): string {
  const loja = req.escopo?.loja_ativa
  if (!loja) throw proibido('Loja ativa nao definida')
  return loja
}

/** user_id do membro autenticado (do escopo de loja resolvido). */
function membroId(req: FastifyRequest): string {
  const id = req.escopo?.user_id
  if (!id) throw naoAutorizado()
  return id
}

/** user_id do operador autenticado (do escopo de operador resolvido). */
function operadorId(req: FastifyRequest): string {
  const id = req.operador?.user_id
  if (!id) throw naoAutorizado()
  return id
}

// ============================================================================ LOJA
export function criarRotasSuporte(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoSuporte(app.pool)
    const guarda = [app.autenticar, app.escopoLoja, app.exigirPermissao('suporte_loja:gerir')]
    const loja = { config: { acesso: ACESSO_LOJA }, preHandler: guarda }
    const lojaSensivel = {
      config: { acesso: ACESSO_LOJA, rateLimit: SENSIVEL }, preHandler: guarda,
    }

    // --- chamados
    app.get('/chamados', {
      ...loja, schema: { response: { 200: ListaChamados } },
    }, async (req) => svc.listarChamadosLoja(lojaAtiva(req)))

    app.post('/chamados', {
      ...lojaSensivel, schema: { body: NovoChamado, response: { 201: ChamadoResumo } },
    }, async (req, reply) => {
      const c = await svc.abrirChamado(lojaAtiva(req), membroId(req), req.body)
      void reply.code(201)
      return c
    })

    app.get('/chamados/:id', {
      ...loja, schema: { params: IdParams, response: { 200: ChamadoFicha } },
    }, async (req) => svc.fichaLoja(lojaAtiva(req), req.params.id))

    app.post('/chamados/:id/mensagens', {
      ...lojaSensivel, schema: { params: IdParams, body: NovaMensagem, response: { 201: ChamadoMensagem } },
    }, async (req, reply) => {
      const m = await svc.mensagemLoja(lojaAtiva(req), req.params.id, membroId(req), req.body.texto)
      void reply.code(201)
      return m
    })

    app.patch('/chamados/:id', {
      ...loja, schema: { params: IdParams, body: PatchChamado, response: { 200: ChamadoResumo } },
    }, async (req) => svc.resolverLoja(lojaAtiva(req), req.params.id))

    // --- acessos (consentimento)
    app.get('/acessos', {
      ...loja, schema: { response: { 200: ListaAcessos } },
    }, async (req) => svc.listarAcessosLoja(lojaAtiva(req)))

    app.post('/acessos', {
      ...lojaSensivel, schema: { body: NovoAcesso, response: { 201: AcessoSuporte } },
    }, async (req, reply) => {
      const a = await svc.concederAcesso(lojaAtiva(req), membroId(req), req.body)
      req.log.info({ acesso_id: a.id, loja_id: a.loja_id, acao: 'concedido' }, 'acesso assistido concedido')
      void reply.code(201)
      return a
    })

    app.post('/acessos/:id/revogar', {
      ...lojaSensivel, schema: { params: IdParams, response: { 200: AcessoSuporte } },
    }, async (req) => {
      const a = await svc.revogarAcesso(lojaAtiva(req), req.params.id, membroId(req))
      req.log.info({ acesso_id: a.id, loja_id: a.loja_id, acao: 'revogado' }, 'acesso assistido revogado')
      return a
    })
  }
}

// ============================================================================ CONSOLE
export function criarRotasPlataformaSuporte(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoSuporte(app.pool)
    const plataforma = (extra: object = {}) => ({ config: { acesso: 'plataforma' as const, ...extra } })
    const ver = [app.autenticar, app.escopoOperador, app.exigirPermissao('suporte_plataforma:ver')]
    const atender = [app.autenticar, app.escopoOperador, app.exigirPermissao('suporte_plataforma:atender')]

    app.get('/chamados', {
      ...plataforma(), preHandler: ver,
      schema: { querystring: SuporteChamadosQuery, response: { 200: ChamadoPagina } },
    }, async (req) => svc.filaChamados(req.query))

    app.get('/chamados/:id', {
      ...plataforma(), preHandler: ver,
      schema: { params: IdParams, response: { 200: ChamadoFicha } },
    }, async (req) => svc.fichaConsole(req.params.id))

    app.post('/chamados/:id/mensagens', {
      ...plataforma({ rateLimit: SENSIVEL }), preHandler: atender,
      schema: { params: IdParams, body: NovaMensagem, response: { 201: ChamadoMensagem } },
    }, async (req, reply) => {
      const m = await svc.mensagemConsole(req.params.id, operadorId(req), req.body.texto)
      void reply.code(201)
      return m
    })

    // Grants de uma loja (loja alvo SEMPRE de params). O operador so LE: nunca concede nem revoga.
    app.get('/lojas/:lojaId/acessos', {
      ...plataforma(), preHandler: ver,
      schema: { params: LojaIdParams, response: { 200: ListaAcessos } },
    }, async (req) => svc.acessosDaLoja(req.params.lojaId))
  }
}

/** Plugin do registry (LOJA). */
export const suporteRoutes: FastifyPluginAsync = async (app, opts) =>
  criarRotasSuporte()(app, opts)

/** Plugin do registry (CONSOLE). */
export const plataformaSuporteRoutes: FastifyPluginAsync = async (app, opts) =>
  criarRotasPlataformaSuporte()(app, opts)
