import type { FastifyPluginAsync, FastifyRequest, preHandlerHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { proibido } from '../../shared/http_errors'
import { criarServicoCobranca, type Ator } from './service'
import {
  ApurarAtrasosResultado, AssinaturaCriar, AssinaturaDTO, AssinaturaPatch, AssinaturasLista, AssinaturasQuery,
  FaturaDTO, FaturaMarcarPaga, FaturasLista, FaturasQuery, GerarFaturasEntrada, GerarFaturasResultado,
  IdParams, MinhasFaturasLista, PlanoCriar, PlanoDTO, PlanoPatch, PlanosLista,
} from './schemas'

/** Ator = operador autenticado. O user_id vem SO do escopo resolvido (nunca do corpo/query). */
function operador(req: FastifyRequest): Ator {
  const o = req.operador
  if (!o) throw proibido('Escopo de operador ausente')
  return { userId: o.user_id }
}

/** Catalogo de planos e so do admin da equipe (operador comum recebe 403). */
const exigirAdmin: preHandlerHookHandler = async (req) => {
  if (req.operador?.papel !== 'admin') throw proibido('Apenas admin gere o catalogo de planos')
}

/** Conta do dono: SEMPRE do escopo de loja resolvido; conta_id forjado no cliente e ignorado. */
function contaDoDono(req: FastifyRequest): string {
  const e = req.escopo
  if (!e) throw proibido('Escopo de loja ausente')
  return e.conta_id
}

export function criarCobrancaRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoCobranca(app.pool)

    // Rotas de PLATAFORMA (operador Whaviso). O plugin de escopo bloqueia por padrao: so passa
    // quem e operador ativo; membro de loja cai no 'conteudo_de_loja' (negado).
    const plataforma = (extra: object = {}) => ({
      config: { acesso: 'plataforma' as const, ...extra },
      preHandler: [app.autenticar, app.escopoOperador],
    })

    app.post('/assinaturas', {
      ...plataforma(),
      schema: { body: AssinaturaCriar, response: { 201: AssinaturaDTO } },
    }, async (req, reply) => reply.status(201).send(await svc.criar(operador(req), req.body)))

    app.get('/assinaturas', {
      ...plataforma(),
      schema: { querystring: AssinaturasQuery, response: { 200: AssinaturasLista } },
    }, async (req) => svc.listarAssinaturas(operador(req), {
      contaId: req.query.conta_id, status: req.query.status,
    }))

    app.patch('/assinaturas/:id', {
      ...plataforma(),
      schema: { params: IdParams, body: AssinaturaPatch, response: { 200: AssinaturaDTO } },
    }, async (req) => svc.alterar(operador(req), req.params.id, req.body))

    app.get('/faturas', {
      ...plataforma(),
      schema: { querystring: FaturasQuery, response: { 200: FaturasLista } },
    }, async (req) => svc.listarFaturas(operador(req), {
      status: req.query.status, competencia: req.query.competencia, contaId: req.query.conta_id,
    }))

    app.post('/faturas/:id/pagar', {
      ...plataforma(),
      schema: { params: IdParams, body: FaturaMarcarPaga, response: { 200: FaturaDTO } },
    }, async (req) => svc.marcarPaga(operador(req), req.params.id, req.body))

    app.post('/faturas/:id/cancelar', {
      ...plataforma(),
      schema: { params: IdParams, response: { 200: FaturaDTO } },
    }, async (req) => svc.cancelarFatura(operador(req), req.params.id))

    // Catalogo de planos (admin). Sem DELETE: plano inativa (estado), nunca some.
    const adminPlataforma = {
      config: { acesso: 'plataforma' as const },
      preHandler: [app.autenticar, app.escopoOperador, exigirAdmin],
    }

    app.get('/planos', {
      ...adminPlataforma,
      schema: { response: { 200: PlanosLista } },
    }, async (req) => svc.listarPlanos(operador(req)))

    app.post('/planos', {
      ...adminPlataforma,
      schema: { body: PlanoCriar, response: { 201: PlanoDTO } },
    }, async (req, reply) => reply.status(201).send(await svc.criarPlano(operador(req), req.body)))

    app.patch('/planos/:id', {
      ...adminPlataforma,
      schema: { params: IdParams, body: PlanoPatch, response: { 200: PlanoDTO } },
    }, async (req) => svc.alterarPlano(operador(req), req.params.id, req.body))

    // Jobs manuais (idempotentes). Rate limit por SEC-101: execucao manual, nao em laco.
    app.post('/cobranca/gerar-faturas', {
      ...plataforma({ rateLimit: { max: 12, timeWindow: '1 minute' } }),
      schema: { body: GerarFaturasEntrada, response: { 200: GerarFaturasResultado } },
    }, async (req) => svc.gerarFaturas(operador(req), req.body.competencia))

    app.post('/cobranca/apurar-atrasos', {
      ...plataforma({ rateLimit: { max: 12, timeWindow: '1 minute' } }),
      schema: { response: { 200: ApurarAtrasosResultado } },
    }, async (req) => svc.apurarAtrasos(operador(req)))

    // Rota do DONO da loja: ve SO as faturas da propria conta (DTO enxuto, sem dados de outra
    // conta). conteudo_de_loja => operador e barrado aqui; conta_id vem do escopo.
    const exigirDono = async (req: FastifyRequest) => {
      const e = req.escopo
      if (!e) throw proibido('Sem escopo de loja')
      if (!Object.values(e.papel_por_loja).some((p) => p === 'dono')) {
        throw proibido('Acesso restrito ao dono da conta')
      }
    }

    app.get('/minha-fatura', {
      config: { acesso: 'conteudo_de_loja' as const },
      preHandler: [app.autenticar, app.escopoLoja, exigirDono],
      schema: { response: { 200: MinhasFaturasLista } },
    }, async (req) => svc.minhasFaturas(contaDoDono(req)))
  }
}

/** Plugin do registry. */
export const cobrancaRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarCobrancaRoutes()(instancia, opts)
