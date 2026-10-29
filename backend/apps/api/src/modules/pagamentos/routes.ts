import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { proibido } from '../../shared/http_errors'
import {
  CobrancaIntermediadaEntrada,
  ConciliarEntrada,
  CredencialPspEntrada,
  CredencialPspStatus,
  CriarCobrancaEntrada,
  ListaPagamentosSaida,
  LojaPixEntrada,
  LojaPixEstadoResposta,
  PagamentoConfigDTO,
  PagamentoConfigPatch,
  pagamentoIdParam,
  PagamentosFiltro,
  PagamentoSaida,
  pedidoIdParam,
  SubcontaResposta,
  WebhookResposta,
} from './schemas'
import type { DepsPagamentos } from './service'
import * as service from './service'
import { depsDeProducao } from './config'

const ACESSO_LOJA = 'conteudo_de_loja' as const
const LIMITE_SENSIVEL = { max: 5, timeWindow: '1 minute' }

/** Loja ativa garantida: `escopoLoja` + `exigirPermissao` já rodaram no preHandler. */
function lojaAtiva(req: FastifyRequest): string {
  const loja = req.escopo?.loja_ativa
  if (!loja) throw proibido('Loja ativa nao definida')
  return loja
}

/** Conta da loja ativa (do escopo resolvido; nunca do cliente). */
function contaAtiva(req: FastifyRequest): string {
  const conta = req.escopo?.conta_id
  if (!conta) throw proibido('Conta nao definida')
  return conta
}

/** Operador autenticado (equipe Whaviso) para rotas de plataforma. */
function operadorAtivo(req: FastifyRequest): void {
  if (!req.operador) throw proibido('Escopo de operador ausente')
}

/** Membro autenticado, escopo de loja resolvido e permissão de gestão da loja (dono/gerente). */
function guardaLoja(app: FastifyInstance) {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('pagamentos:ver')]
}

/** Escrita (chave Pix, cobranca, conciliar, cancelar): `pagamentos:gerir`. */
function guardaGerir(app: FastifyInstance) {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('pagamentos:gerir')]
}

/** Monta as rotas com um resolvedor PREGUICOSO das dependências (cifra da chave Pix). */
function registrar(app: FastifyInstance, obterDeps: () => DepsPagamentos): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // Captura o corpo CRU (bytes exatos recebidos) para a verificacao de assinatura do webhook do PSP,
  // mantendo o parse JSON das demais rotas. Escopo encapsulado deste plugin. Uma assinatura HMAC so
  // confere sobre o corpo original; re-serializar (JSON.stringify do body ja parseado) quebraria.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    ;(req as unknown as { rawBody?: string }).rawBody = body as string
    try {
      done(null, (body as string).length ? JSON.parse(body as string) : {})
    } catch (e) {
      done(e as Error)
    }
  })

  const loja = { config: { acesso: ACESSO_LOJA }, preHandler: guardaLoja(app) }
  const lojaGerir = { config: { acesso: ACESSO_LOJA }, preHandler: guardaGerir(app) }
  const lojaSensivel = {
    config: { acesso: ACESSO_LOJA, rateLimit: LIMITE_SENSIVEL },
    preHandler: guardaGerir(app),
  }

  // GET /pagamentos/config: modo do Pix e quem paga a taxa (default se a loja nao salvou ainda).
  r.get('/config', { ...loja, schema: { response: { 200: PagamentoConfigDTO } } },
    async (req) => service.obterConfigPagamento(app.pool, lojaAtiva(req)))

  // PUT /pagamentos/config: salva a config de pagamento da loja (dono/gerente).
  r.put('/config', { ...lojaGerir, schema: { body: PagamentoConfigPatch, response: { 200: PagamentoConfigDTO } } },
    async (req) => {
      const cfg = await service.definirConfigPagamento(app.pool, lojaAtiva(req), req.body)
      req.log.info(
        { loja_id: lojaAtiva(req), pix_modo: cfg.pix_modo, encargo_modo: cfg.encargo_modo, cartao_habilitado: cfg.cartao_habilitado, acao: 'pagamento_config' },
        'config de pagamento salva',
      )
      return cfg
    })

  // --- PSP (pagamento intermediado): credencial (operador), subconta (loja), cobranca, webhook ---

  const plataformaPsp = {
    config: { acesso: 'plataforma' as const, rateLimit: LIMITE_SENSIVEL },
    preHandler: [app.autenticar, app.escopoOperador, app.exigirPermissao('chaves_api:gerir')],
  }

  // GET /pagamentos/psp/credencial: metadado da credencial do PSP (operador). NUNCA a chave.
  r.get('/psp/credencial', { ...plataformaPsp, schema: { response: { 200: CredencialPspStatus } } },
    async (req) => {
      operadorAtivo(req)
      return service.statusCredencialPsp(app.pool)
    })

  // PUT /pagamentos/psp/credencial: set/rotate (operador). A chave em claro nunca volta nem e logada.
  r.put('/psp/credencial',
    { ...plataformaPsp, schema: { body: CredencialPspEntrada, response: { 200: CredencialPspStatus } } },
    async (req) => {
      operadorAtivo(req)
      const st = await service.definirCredencialPsp(app.pool, obterDeps(), req.body.chave)
      req.log.info({ acao: 'psp_credencial_definida' }, 'credencial do psp definida')
      return st
    })

  // GET /pagamentos/psp/subconta: status do recebedor da loja no PSP.
  r.get('/psp/subconta', { ...loja, schema: { response: { 200: SubcontaResposta } } },
    async (req) => ({ subconta: await service.obterSubconta(app.pool, lojaAtiva(req)) }))

  // POST /pagamentos/psp/subconta: inicia o onboarding do recebedor (dono/gerente).
  r.post('/psp/subconta', { ...lojaGerir, schema: { response: { 201: SubcontaResposta } } },
    async (req, reply) => {
      const subconta = await service.iniciarSubconta(app.pool, lojaAtiva(req))
      void reply.code(201)
      return { subconta }
    })

  // POST /pagamentos/pedidos/:pedidoId/intermediado: cobranca via PSP (Pix intermediado ou cartao).
  r.post('/pedidos/:pedidoId/intermediado',
    {
      ...lojaSensivel,
      schema: { params: pedidoIdParam, body: CobrancaIntermediadaEntrada, response: { 201: PagamentoSaida } },
    },
    async (req, reply) => {
      const pag = await service.criarCobrancaIntermediada(
        app.pool, obterDeps(), lojaAtiva(req), contaAtiva(req), req.params.pedidoId, req.body.meio,
      )
      req.log.info(
        { pagamento_id: pag.id, pedido_id: pag.pedido_id, loja_id: pag.loja_id, status: pag.status, acao: 'cobranca_intermediada' },
        'cobranca intermediada criada',
      )
      void reply.code(201)
      return pag
    })

  // POST /pagamentos/webhooks/psp/asaas: webhook PUBLICO do PSP (sem auth; assinatura verificada no
  // service sobre o corpo CRU). Rate limit por IP: a decifra da credencial roda antes de poder checar
  // a assinatura, entao limitamos o flood (requests sem assinatura ja sao rejeitados cedo, sem decifra).
  r.post('/webhooks/psp/asaas',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } }, schema: { response: { 200: WebhookResposta } } },
    async (req) => {
      const bruto = req.headers['asaas-signature'] ?? req.headers['x-psp-signature']
      const assinatura = Array.isArray(bruto) ? bruto[0] : bruto
      const corpoBruto = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {})
      await service.processarWebhookPsp(app.pool, obterDeps(), assinatura, corpoBruto)
      return { ok: true }
    })

  // GET /pagamentos/pix: metadado da chave Pix da loja (nunca a chave em claro nem a cifra).
  r.get('/pix', { ...loja, schema: { response: { 200: LojaPixEstadoResposta } } }, async (req) => ({
    pix: await service.estadoPix(app.pool, lojaAtiva(req)),
  }))

  // PUT /pagamentos/pix: cadastra/rotaciona a chave (dono/gerente). SEC-101: rate limit.
  r.put(
    '/pix',
    { ...lojaSensivel, schema: { body: LojaPixEntrada, response: { 200: LojaPixEstadoResposta } } },
    async (req) => {
      const estado = await service.definirPix(app.pool, obterDeps(), lojaAtiva(req), req.body)
      // Log só com loja + tipo; NUNCA a chave, titular, cidade ou cifra (SEC-024).
      req.log.info({ loja_id: estado.loja_id, tipo: estado.tipo, acao: 'pix_definido' }, 'pix definido')
      return { pix: estado }
    },
  )

  // POST /pagamentos/pedidos/:pedidoId: cria (ou reusa) a cobrança Pix do pedido. SEC-101.
  r.post(
    '/pedidos/:pedidoId',
    {
      ...lojaSensivel,
      schema: { params: pedidoIdParam, body: CriarCobrancaEntrada, response: { 201: PagamentoSaida } },
    },
    async (req, reply) => {
      const pag = await service.criarCobranca(
        app.pool,
        obterDeps(),
        lojaAtiva(req),
        req.params.pedidoId,
        req.body,
      )
      // Log só com ids/estado; NUNCA o br_code (embute a chave) nem valor sensível (SEC-024).
      req.log.info(
        { pagamento_id: pag.id, pedido_id: pag.pedido_id, loja_id: pag.loja_id, status: pag.status },
        'cobranca pix criada',
      )
      void reply.code(201)
      return pag
    },
  )

  // GET /pagamentos: lista da loja (filtro opcional por pedido e/ou status).
  r.get(
    '/',
    { ...loja, schema: { querystring: PagamentosFiltro, response: { 200: ListaPagamentosSaida } } },
    async (req) => ({
      pagamentos: await service.listar(app.pool, lojaAtiva(req), req.query),
    }),
  )

  // GET /pagamentos/:id: detalhe (expira preguiçosamente; 404 fora do escopo).
  r.get(
    '/:id',
    { ...loja, schema: { params: pagamentoIdParam, response: { 200: PagamentoSaida } } },
    async (req) => service.detalhar(app.pool, lojaAtiva(req), req.params.id),
  )

  // POST /pagamentos/:id/conciliar: marca pago (idempotente).
  r.post(
    '/:id/conciliar',
    { ...lojaGerir, schema: { params: pagamentoIdParam, body: ConciliarEntrada, response: { 200: PagamentoSaida } } },
    async (req) => {
      const pag = await service.conciliar(app.pool, lojaAtiva(req), req.params.id, req.body)
      req.log.info({ pagamento_id: pag.id, loja_id: pag.loja_id, status: pag.status }, 'cobranca conciliada')
      return pag
    },
  )

  // POST /pagamentos/:id/cancelar: cancela uma pendente (idempotente).
  r.post(
    '/:id/cancelar',
    { ...lojaGerir, schema: { params: pagamentoIdParam, response: { 200: PagamentoSaida } } },
    async (req) => {
      const pag = await service.cancelar(app.pool, lojaAtiva(req), req.params.id)
      req.log.info({ pagamento_id: pag.id, loja_id: pag.loja_id, status: pag.status }, 'cobranca cancelada')
      return pag
    },
  )
}

/** Plugin de PRODUCAO: resolve deps preguiçosamente de `app.env` (MASTER_KEY). */
export const pagamentosRoutes: FastifyPluginAsync = async (app) => {
  let cache: DepsPagamentos | null = null
  registrar(app, () => (cache ??= depsDeProducao(app.env)))
}

/** Fábrica para TESTE: injeta `cripto` com chave de teste. */
export function criarRotasPagamentos(deps: DepsPagamentos): FastifyPluginAsync {
  return async (app) => {
    registrar(app, () => deps)
  }
}
