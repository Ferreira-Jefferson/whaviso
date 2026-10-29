import type { FastifyPluginAsync, FastifyRequest, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { NaoEncontrado, Proibido } from '../../shared/http_errors'
import { papelPermite, type Permissao } from '../../shared/tenant'
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
    // Guarda de rota (defesa em profundidade; o service re-checa por id). As rotas de loja
    // operam pela loja do :id (nao pela loja ativa), entao o guard le o papel dessa loja e
    // exige a permissao na grade, espelhando exigirGestor/contaDoDono do service. Fora do
    // escopo = 404 (nao confirma a existencia de loja de outra conta).
    const exigirNaLoja =
      (permissao: Permissao): preHandlerHookHandler =>
      async (req: FastifyRequest) => {
        const escopo = req.escopo
        const id = (req.params as { id?: string }).id
        if (!escopo || !id) throw new Proibido()
        const papel = escopo.papel_por_loja[id]
        if (!escopo.loja_ids.includes(id) || !papel) throw new NaoEncontrado()
        if (!papelPermite(papel, permissao)) throw new Proibido()
      }
    // Editar/branding/pausar/capacidade: exige `lojas:gerir` (padrao: dono e gerente).
    const comGestao = { config, preHandler: [app.autenticar, app.escopoLoja, exigirNaLoja('lojas:gerir')] }
    // Desativar/reativar: operacao de dono, FIXA e nao delegavel (nao e governada pela grade editavel,
    // assim como a administracao da propria conta). Checa o papel dessa loja direto: so `dono` passa.
    const exigirDonoDaLoja: preHandlerHookHandler = async (req: FastifyRequest) => {
      const escopo = req.escopo
      const id = (req.params as { id?: string }).id
      if (!escopo || !id) throw new Proibido()
      const papel = escopo.papel_por_loja[id]
      if (!escopo.loja_ids.includes(id) || !papel) throw new NaoEncontrado()
      if (papel !== 'dono') throw new Proibido()
    }
    const soDono = { config, preHandler: [app.autenticar, app.escopoLoja, exigirDonoDaLoja] }
    // Criar: so autenticacao; nao ha loja ainda, a conta vem do vinculo de dono (service), nunca do corpo.
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
        ...comGestao,
        schema: { params: LojaParams, body: LojaAtualizarEntrada, response: { 200: LojaSaida } },
      },
      async (req) => service.atualizar(app.pool, req.escopo!, req.params.id, req.body),
    )

    app.patch(
      '/:id/branding',
      {
        ...comGestao,
        schema: { params: LojaParams, body: LojaBrandingEntrada, response: { 200: LojaSaida } },
      },
      async (req) => service.branding(app.pool, req.escopo!, req.params.id, req.body, hostsLogo),
    )

    app.post(
      '/:id/desativar',
      { ...soDono, schema: { params: LojaParams, response: { 200: LojaSaida } } },
      async (req) => service.alterarAtivo(app.pool, usuario(req), req.params.id, false),
    )

    app.post(
      '/:id/reativar',
      { ...soDono, schema: { params: LojaParams, response: { 200: LojaSaida } } },
      async (req) => service.alterarAtivo(app.pool, usuario(req), req.params.id, true),
    )

    // G7: pausar/despausar a loja agora e configurar capacidade por janela (gestor da loja).
    app.post(
      '/:id/pausar',
      { ...comGestao, schema: { params: LojaParams, body: LojaPausarEntrada, response: { 200: LojaSaida } } },
      async (req) => service.pausar(app.pool, req.escopo!, req.params.id, req.body),
    )

    app.post(
      '/:id/despausar',
      { ...comGestao, schema: { params: LojaParams, response: { 200: LojaSaida } } },
      async (req) => service.despausar(app.pool, req.escopo!, req.params.id),
    )

    app.patch(
      '/:id/capacidade',
      { ...comGestao, schema: { params: LojaParams, body: LojaCapacidadeEntrada, response: { 200: LojaSaida } } },
      async (req) => service.definirCapacidade(app.pool, req.escopo!, req.params.id, req.body),
    )
  }
}

export const lojasRoutes: FastifyPluginAsync = criarLojasRoutes()
