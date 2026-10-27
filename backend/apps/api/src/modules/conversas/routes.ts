import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import {
  ConversaDetalheSaida,
  ConversaEncerrarEntrada,
  ConversaEncerradaSaida,
  ConversaHandoffSaida,
  ConversaListaEntrada,
  ConversaListaSaida,
  LidaSaida,
  MensagemEnviadaSaida,
  MensagemEnviarEntrada,
  MensagensEntrada,
  MensagensSaida,
  ParamConversa,
} from './schemas'
import { abrir, encerrar, historico, listar, marcarLida, responder, type Relogio } from './service'
import { assumir, devolver } from './handoff'
import { papelNaLojaAtiva } from '../../shared/tenant'

export interface OpcoesConversas {
  /** Relogio injetavel (testes de borda da janela). Padrao: agora. */
  relogio?: Relogio
  /** Limite de respostas por conversa por minuto (SEC-101). */
  respostasPorMinuto?: number
}

/** Loja ativa: header x-loja-id (validado pelo escopo); com uma unica loja, ela e a ativa. */
async function fixarLojaAtiva(req: FastifyRequest): Promise<void> {
  const e = req.escopo
  if (!e || e.loja_ativa) return
  const unica = e.loja_ids.length === 1 ? e.loja_ids[0] : undefined
  if (!unica) throw new HttpError(400, 'loja_ativa_obrigatoria', 'Informe a loja ativa no header x-loja-id')
  req.escopo = { ...e, loja_ativa: unica }
}

function lojaDaRequisicao(req: FastifyRequest): string {
  const loja = req.escopo?.loja_ativa
  if (!loja) throw new HttpError(400, 'loja_ativa_obrigatoria', 'Informe a loja ativa no header x-loja-id')
  return loja
}

function usuarioDaRequisicao(req: FastifyRequest): string {
  const u = req.escopo?.user_id
  if (!u) throw new HttpError(401, 'nao_autorizado', 'Autenticacao necessaria')
  return u
}

export function criarConversasRoutes(opcoes: OpcoesConversas = {}): FastifyPluginAsync {
  const agora: Relogio = opcoes.relogio ?? (() => new Date())
  const respostasPorMinuto = opcoes.respostasPorMinuto ?? 20

  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const acesso = { acesso: 'conteudo_de_loja' as const }
    const guardas = [app.autenticar, app.escopoLoja, fixarLojaAtiva, app.exigirPermissao('conversas:atender')]

    app.get(
      '/',
      {
        config: acesso,
        preHandler: guardas,
        schema: { querystring: ConversaListaEntrada, response: { 200: ConversaListaSaida } },
      },
      async (req) => listar(app.pool, lojaDaRequisicao(req), req.query, agora()),
    )

    app.get(
      '/:id',
      { config: acesso, preHandler: guardas, schema: { params: ParamConversa, response: { 200: ConversaDetalheSaida } } },
      async (req) => abrir(app.pool, lojaDaRequisicao(req), req.params.id, usuarioDaRequisicao(req), agora()),
    )

    app.get(
      '/:id/mensagens',
      {
        config: acesso,
        preHandler: guardas,
        schema: { params: ParamConversa, querystring: MensagensEntrada, response: { 200: MensagensSaida } },
      },
      async (req) => historico(app.pool, lojaDaRequisicao(req), req.params.id, req.query),
    )

    app.post(
      '/:id/lida',
      { config: acesso, preHandler: guardas, schema: { params: ParamConversa, response: { 200: LidaSaida } } },
      async (req) => marcarLida(app.pool, lojaDaRequisicao(req), req.params.id),
    )

    app.post(
      '/:id/mensagens',
      {
        config: {
          ...acesso,
          rateLimit: {
            max: respostasPorMinuto,
            timeWindow: '1 minute',
            // Por conversa (e IP de origem): o limite nao e compartilhado entre conversas.
            keyGenerator: (req: FastifyRequest) => `${req.ip}:${(req.params as { id?: string }).id ?? ''}`,
          },
        },
        preHandler: guardas,
        schema: {
          params: ParamConversa,
          body: MensagemEnviarEntrada,
          response: { 201: MensagemEnviadaSaida },
        },
      },
      async (req, reply) => {
        const saida = await responder(
          app.pool,
          lojaDaRequisicao(req),
          req.params.id,
          usuarioDaRequisicao(req),
          req.body.texto,
          agora(),
        )
        return reply.status(201).send(saida)
      },
    )

    // Handoff manual (human-in-the-loop): assumir (ia->humano) e devolver (humano->ia).
    app.post(
      '/:id/assumir',
      { config: acesso, preHandler: guardas, schema: { params: ParamConversa, response: { 200: ConversaHandoffSaida } } },
      async (req) => assumir(app.pool, lojaDaRequisicao(req), req.params.id, usuarioDaRequisicao(req)),
    )

    app.post(
      '/:id/devolver',
      { config: acesso, preHandler: guardas, schema: { params: ParamConversa, response: { 200: ConversaHandoffSaida } } },
      async (req) =>
        devolver(
          app.pool,
          lojaDaRequisicao(req),
          req.params.id,
          usuarioDaRequisicao(req),
          req.escopo ? papelNaLojaAtiva(req.escopo) : null,
        ),
    )

    app.post(
      '/:id/encerrar',
      {
        config: acesso,
        preHandler: guardas,
        // Corpo opcional: validado a mao (um POST sem corpo nao passa pelo validador do body).
        schema: { params: ParamConversa, response: { 200: ConversaEncerradaSaida } },
      },
      async (req) => {
        const corpo = ConversaEncerrarEntrada.safeParse(req.body ?? {})
        if (!corpo.success) throw new HttpError(400, 'entrada_invalida', 'Entrada invalida: (corpo)')
        return encerrar(app.pool, lojaDaRequisicao(req), req.params.id, corpo.data.motivo)
      },
    )
  }
}

export const conversasRoutes: FastifyPluginAsync = criarConversasRoutes()
