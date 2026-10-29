import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { proibido } from '../../shared/http_errors'
import {
  ConciliarEntrada,
  CriarCobrancaEntrada,
  ListaPagamentosSaida,
  LojaPixEntrada,
  LojaPixEstadoResposta,
  pagamentoIdParam,
  PagamentosFiltro,
  PagamentoSaida,
  pedidoIdParam,
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
  const loja = { config: { acesso: ACESSO_LOJA }, preHandler: guardaLoja(app) }
  const lojaGerir = { config: { acesso: ACESSO_LOJA }, preHandler: guardaGerir(app) }
  const lojaSensivel = {
    config: { acesso: ACESSO_LOJA, rateLimit: LIMITE_SENSIVEL },
    preHandler: guardaGerir(app),
  }

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
