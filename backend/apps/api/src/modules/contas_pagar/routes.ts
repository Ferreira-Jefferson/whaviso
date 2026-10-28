import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { cifraPadrao, type Cifra } from './cripto'
import { criarServicoContasPagar, type Ator } from './service'
import {
  AcertoAjusteEntrada, AcertoLancamento, AcertoPagoSaida, AcertoPeriodoQuery, AcertoPeriodoSaida,
  ContaPagarAtualizarEntrada, ContaPagarEntrada, ContaPagarListaQuery, ContaPagarListaSaida,
  ContaPagarSaida, FornecedorAtualizarEntrada, FornecedorEntrada, FornecedorListaQuery,
  FornecedorListaSaida, FornecedorSaida, FornecedorTelefoneSaida, IdParams, PagarAcertoEntrada,
  PagarContaEntrada,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

/** Fabrica do plugin; `cifra` injetavel (testes). Padrao: cifra da MASTER_KEY (lazy). */
export function criarContasPagarRoutes(cifra?: Cifra): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoContasPagar(app.pool, cifra ?? cifraPadrao())
    const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
    // Cadastro de fornecedor e lancamento (dinheiro e PII): dono e gerente (permissao loja:gerir).
    const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]

    // --- Fornecedores ---
    app.get('/', {
      ...loja(), preHandler: gerir,
      schema: { querystring: FornecedorListaQuery, response: { 200: FornecedorListaSaida } },
    }, async (req) => svc.listarFornecedores(ator(req), req.query.incluir_inativos === 'true'))

    app.post('/', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerir,
      schema: { body: FornecedorEntrada, response: { 201: FornecedorSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criarFornecedor(ator(req), req.body)))

    // --- Contas a pagar (rotas estaticas antes das rotas /:id de fornecedor) ---
    app.get('/contas', {
      ...loja(), preHandler: gerir,
      schema: { querystring: ContaPagarListaQuery, response: { 200: ContaPagarListaSaida } },
    }, async (req) => svc.listarContas(ator(req), {
      credorTipo: req.query.credor_tipo,
      status: req.query.status,
      de: req.query.de,
      ate: req.query.ate,
    }))

    app.post('/contas', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerir,
      schema: { body: ContaPagarEntrada, response: { 201: ContaPagarSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criarConta(ator(req), req.body)))

    app.patch('/contas/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, body: ContaPagarAtualizarEntrada, response: { 200: ContaPagarSaida } },
    }, async (req) => svc.atualizarConta(ator(req), req.params.id, req.body))

    app.post('/contas/:id/pagar', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerir,
      schema: { params: IdParams, body: PagarContaEntrada, response: { 200: ContaPagarSaida } },
    }, async (req) => svc.pagarConta(ator(req), req.params.id, req.body.valor_centavos))

    // --- Acerto do motoboy por periodo (rotas estaticas; antes das rotas /:id de fornecedor) ---
    app.get('/acertos', {
      ...loja(), preHandler: gerir,
      schema: { querystring: AcertoPeriodoQuery, response: { 200: AcertoPeriodoSaida } },
    }, async (req) => svc.acertoPeriodo(ator(req), req.query.de, req.query.ate))

    app.post('/acertos/ajuste', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerir,
      schema: { body: AcertoAjusteEntrada, response: { 201: AcertoLancamento } },
    }, async (req, reply) => reply.status(201).send(await svc.lancarAjuste(ator(req), req.body)))

    app.post('/acertos/pagar', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerir,
      schema: { body: PagarAcertoEntrada, response: { 200: AcertoPagoSaida } },
    }, async (req) => svc.pagarAcerto(ator(req), req.body))

    // --- Fornecedor por id ---
    app.get('/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, response: { 200: FornecedorSaida } },
    }, async (req) => svc.obterFornecedor(ator(req), req.params.id))

    app.patch('/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, body: FornecedorAtualizarEntrada, response: { 200: FornecedorSaida } },
    }, async (req) => svc.atualizarFornecedor(ator(req), req.params.id, req.body))

    app.post('/:id/ativar', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, response: { 200: FornecedorSaida } },
    }, async (req) => svc.alterarAtivoFornecedor(ator(req), req.params.id, true))

    app.post('/:id/desativar', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, response: { 200: FornecedorSaida } },
    }, async (req) => svc.alterarAtivoFornecedor(ator(req), req.params.id, false))

    // Telefone do fornecedor em claro (PII): so dono/gerente, rate limit, sem cache, auditado sem o valor.
    app.post('/:id/telefone/revelar', {
      ...loja({ rateLimit: { max: 10, timeWindow: '1 minute' } }),
      preHandler: [app.autenticar, app.escopoLoja, app.exigirPapel('dono', 'gerente')],
      schema: { params: IdParams, response: { 200: FornecedorTelefoneSaida } },
    }, async (req, reply) => {
      void reply.header('cache-control', 'no-store')
      return svc.revelarTelefone(ator(req), req.params.id)
    })
  }
}

/** Plugin do registry: a cifra vem da MASTER_KEY da env (kernel @whaviso/shared/cifra). */
export const contasPagarRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarContasPagarRoutes()(instancia, opts)
