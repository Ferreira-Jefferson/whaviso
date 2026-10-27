import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { Proibido } from '../../shared/http_errors'
import {
  LojaAtualizarEntrada,
  LojaBrandingEntrada,
  LojaCapacidadeEntrada,
  LojaCriarEntrada,
  LojaListaQuery,
  LojaListaSaida,
  LojaParams,
  LojaPausarEntrada,
  LojaSaida,
} from './schemas'
import * as service from './service'

export interface OpcoesLojas {
  /** Hosts extras aceitos para logo_url (alem do host do SUPABASE_URL). */
  hostsLogoExtras?: readonly string[]
}

export function criarLojasRoutes(opcoes: OpcoesLojas = {}): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const hostsLogo = [new URL(app.env.SUPABASE_URL).hostname, ...(opcoes.hostsLogoExtras ?? [])].map(
      (h) => h.toLowerCase(),
    )
    const config = { acesso: 'conteudo_de_loja' as const }
    const comEscopo = { config, preHandler: [app.autenticar, app.escopoLoja] }
    // Criar/desativar/reativar: so autenticacao; a conta vem do vinculo de dono, nunca do corpo.
    const soAuth = { config, preHandler: [app.autenticar] }
    const usuario = (req: { usuario: { user_id: string } | null }): string => {
      if (!req.usuario) throw new Proibido()
      return req.usuario.user_id
    }

    app.get(
      '/',
      { ...comEscopo, schema: { querystring: LojaListaQuery, response: { 200: LojaListaSaida } } },
      async (req) => ({
        itens: await service.listar(app.pool, req.escopo!, req.query.incluir_inativas === 'true'),
      }),
    )

    app.get(
      '/:id',
      { ...comEscopo, schema: { params: LojaParams, response: { 200: LojaSaida } } },
      async (req) => service.obter(app.pool, req.escopo!, req.params.id),
    )

    app.post(
      '/',
      { ...soAuth, schema: { body: LojaCriarEntrada, response: { 201: LojaSaida } } },
      async (req, reply) => {
        const loja = await service.criar(app.pool, usuario(req), req.body)
        return reply.status(201).send(loja)
      },
    )

    app.patch(
      '/:id',
      {
        ...comEscopo,
        schema: { params: LojaParams, body: LojaAtualizarEntrada, response: { 200: LojaSaida } },
      },
      async (req) => service.atualizar(app.pool, req.escopo!, req.params.id, req.body),
    )

    app.patch(
      '/:id/branding',
      {
        ...comEscopo,
        schema: { params: LojaParams, body: LojaBrandingEntrada, response: { 200: LojaSaida } },
      },
      async (req) => service.branding(app.pool, req.escopo!, req.params.id, req.body, hostsLogo),
    )

    app.post(
      '/:id/desativar',
      { ...soAuth, schema: { params: LojaParams, response: { 200: LojaSaida } } },
      async (req) => service.alterarAtivo(app.pool, usuario(req), req.params.id, false),
    )

    app.post(
      '/:id/reativar',
      { ...soAuth, schema: { params: LojaParams, response: { 200: LojaSaida } } },
      async (req) => service.alterarAtivo(app.pool, usuario(req), req.params.id, true),
    )

    // G7: pausar/despausar a loja agora e configurar capacidade por janela (gestor da loja).
    app.post(
      '/:id/pausar',
      { ...comEscopo, schema: { params: LojaParams, body: LojaPausarEntrada, response: { 200: LojaSaida } } },
      async (req) => service.pausar(app.pool, req.escopo!, req.params.id, req.body),
    )

    app.post(
      '/:id/despausar',
      { ...comEscopo, schema: { params: LojaParams, response: { 200: LojaSaida } } },
      async (req) => service.despausar(app.pool, req.escopo!, req.params.id),
    )

    app.patch(
      '/:id/capacidade',
      { ...comEscopo, schema: { params: LojaParams, body: LojaCapacidadeEntrada, response: { 200: LojaSaida } } },
      async (req) => service.definirCapacidade(app.pool, req.escopo!, req.params.id, req.body),
    )
  }
}

export const lojasRoutes: FastifyPluginAsync = criarLojasRoutes()
