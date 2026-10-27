import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { cifraPadrao, type Cifra } from './cripto'
import { criarServicoMotoboys, type Ator } from './service'
import {
  FechamentoDia, FechamentoDiaQuery, FechamentoLinha, IdParams, LancamentoManualEntrada, LancamentoSaida,
  MotoboyAtualizarEntrada, MotoboyEntrada, MotoboyListaQuery, MotoboyListaSaida, MotoboyPixSaida,
  MotoboyResumoPeriodo, MotoboyResumoQuery, MotoboySaida, MotoboySeletorListaSaida, PagarFechamentoEntrada,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

/** Fabrica do plugin; `cifra` injetavel (testes). Padrao: cifra da MASTER_KEY (lazy). */
export function criarMotoboysRoutes(cifra?: Cifra): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoMotoboys(app.pool, cifra ?? cifraPadrao())
    const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
    // Cadastro e acerto de motoboy (dinheiro e PII): dono e gerente (loja:gerir).
    const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]
    // Seletor do despacho: quem opera o kanban de pedidos (so id, nome, veiculo, ativo).
    const operar = [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')]

    // --- Cadastro ---
    app.get('/', {
      ...loja(), preHandler: gerir,
      schema: { querystring: MotoboyListaQuery, response: { 200: MotoboyListaSaida } },
    }, async (req) => svc.listar(ator(req), req.query.incluir_inativos === 'true'))

    app.get('/seletor', {
      ...loja(), preHandler: operar,
      schema: { querystring: MotoboyListaQuery, response: { 200: MotoboySeletorListaSaida } },
    }, async (req) => svc.seletor(ator(req), req.query.incluir_inativos === 'true'))

    app.post('/', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerir,
      schema: { body: MotoboyEntrada, response: { 201: MotoboySaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criar(ator(req), req.body)))

    // --- Fechamento do dia (rotas estaticas antes das rotas com :id) ---
    app.get('/fechamentos', {
      ...loja(), preHandler: gerir,
      schema: { querystring: FechamentoDiaQuery, response: { 200: FechamentoDia } },
    }, async (req) => svc.fechamentoDia(ator(req), req.query.data))

    app.get('/fechamentos/resumo', {
      ...loja(), preHandler: gerir,
      schema: { querystring: MotoboyResumoQuery, response: { 200: MotoboyResumoPeriodo } },
    }, async (req) => svc.resumo(ator(req), req.query.de, req.query.ate))

    app.post('/fechamentos/:id/pagar', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerir,
      schema: { params: IdParams, body: PagarFechamentoEntrada, response: { 200: FechamentoLinha } },
    }, async (req) => svc.pagar(ator(req), req.params.id, req.body.total_centavos))

    // --- Motoboy por id ---
    app.get('/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, response: { 200: MotoboySaida } },
    }, async (req) => svc.obter(ator(req), req.params.id))

    app.patch('/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, body: MotoboyAtualizarEntrada, response: { 200: MotoboySaida } },
    }, async (req) => svc.atualizar(ator(req), req.params.id, req.body))

    app.post('/:id/ativar', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, response: { 200: MotoboySaida } },
    }, async (req) => svc.alterarAtivo(ator(req), req.params.id, true))

    app.post('/:id/desativar', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, response: { 200: MotoboySaida } },
    }, async (req) => svc.alterarAtivo(ator(req), req.params.id, false))

    app.post('/:id/lancamentos', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerir,
      schema: { params: IdParams, body: LancamentoManualEntrada, response: { 201: LancamentoSaida } },
    }, async (req, reply) =>
      reply.status(201).send(await svc.lancamentoManual(ator(req), req.params.id, req.body)))

    // Pix em claro (PII): so para pagar, dono/gerente, rate limit, sem cache, auditado sem o valor.
    app.post('/:id/pix/revelar', {
      ...loja({ rateLimit: { max: 10, timeWindow: '1 minute' } }),
      preHandler: [app.autenticar, app.escopoLoja, app.exigirPapel('dono', 'gerente')],
      schema: { params: IdParams, response: { 200: MotoboyPixSaida } },
    }, async (req, reply) => {
      void reply.header('cache-control', 'no-store')
      return svc.revelarPix(ator(req), req.params.id)
    })
  }
}

/** Plugin do registry: a cifra vem da MASTER_KEY da env (kernel @whaviso/shared/cifra). */
export const motoboysRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarMotoboysRoutes()(instancia, opts)
