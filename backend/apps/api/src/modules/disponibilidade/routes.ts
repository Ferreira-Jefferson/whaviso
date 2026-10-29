import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoDisponibilidade, type Ator } from './service'
import {
  DisponibilidadeAgoraSaida,
  ExcecaoEntrada,
  ExcecaoListaSaida,
  ExcecaoSaida,
  HorarioEntrada,
  HorarioListaSaida,
  HorarioPatch,
  HorarioSaida,
  IdParams,
  AgendamentoEntrada,
  AgendamentoGetSaida,
  AgendamentoConfigSaida,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export function criarDisponibilidadeRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoDisponibilidade(app.pool)
    const config = { acesso: 'conteudo_de_loja' as const }
    // Leitura: qualquer membro da loja. Escrita: gestor (dono/gerente), via permissao disponibilidade:gerir.
    const ler = { config, preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('disponibilidade:ver', { lojaAusente: 'obrigatoria' })] }
    const gerir = {
      config,
      preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('disponibilidade:gerir')],
    }

    // --- Horarios de funcionamento ---
    app.get('/horarios', {
      ...ler, schema: { response: { 200: HorarioListaSaida } },
    }, async (req) => svc.listarHorarios(ator(req)))

    app.post('/horarios', {
      ...gerir, schema: { body: HorarioEntrada, response: { 201: HorarioSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criarHorario(ator(req), req.body)))

    app.patch('/horarios/:id', {
      ...gerir, schema: { params: IdParams, body: HorarioPatch, response: { 200: HorarioSaida } },
    }, async (req) => svc.atualizarHorario(ator(req), req.params.id, req.body))

    app.post('/horarios/:id/desativar', {
      ...gerir, schema: { params: IdParams, response: { 200: HorarioSaida } },
    }, async (req) => svc.desativarHorario(ator(req), req.params.id))

    // --- Janela de agendamento da loja ---
    app.get('/agendamento', {
      ...ler, schema: { response: { 200: AgendamentoGetSaida } },
    }, async (req) => svc.obterAgendamento(ator(req)))

    app.put('/agendamento', {
      ...gerir, schema: { body: AgendamentoEntrada, response: { 200: AgendamentoConfigSaida } },
    }, async (req) => svc.definirAgendamento(ator(req), req.body))

    // --- Excecoes / feriados ---
    app.get('/excecoes', {
      ...ler, schema: { response: { 200: ExcecaoListaSaida } },
    }, async (req) => svc.listarExcecoes(ator(req)))

    app.post('/excecoes', {
      ...gerir, schema: { body: ExcecaoEntrada, response: { 201: ExcecaoSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criarExcecao(ator(req), req.body)))

    app.post('/excecoes/:id/desativar', {
      ...gerir, schema: { params: IdParams, response: { 200: ExcecaoSaida } },
    }, async (req) => svc.desativarExcecao(ator(req), req.params.id))

    // --- Estado derivado (aceitando agora / atendente pode responder) ---
    app.get('/agora', {
      ...ler, schema: { response: { 200: DisponibilidadeAgoraSaida } },
    }, async (req) => svc.agora(ator(req)))
  }
}

export const disponibilidadeRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarDisponibilidadeRoutes()(instancia, opts)
