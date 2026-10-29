import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { proibido } from '../../shared/http_errors'
import {
  listaNumerosSaida,
  numeroConectarEntrada,
  numeroIdParam,
  numeroReconectarEntrada,
  numeroSaida,
  numeroStatusEntrada,
} from './schemas'
import type { DepsNumeros } from './service'
import * as service from './service'
import { depsDeProducao } from './config'

const ACESSO_LOJA = 'conteudo_de_loja' as const
const LIMITE_SENSIVEL = { max: 5, timeWindow: '1 minute' }

/** Loja ativa garantida: `escopoLoja` + `exigirPermissao` ja rodaram no preHandler. */
function lojaAtiva(req: FastifyRequest): string {
  const loja = req.escopo?.loja_ativa
  if (!loja) throw proibido('Loja ativa nao definida')
  return loja
}

/** Monta as rotas com um resolvedor PREGUICOSO de dependencias (cifra + porta Meta). */
function registrar(app: FastifyInstance, obterDeps: () => DepsNumeros): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const loja = { config: { acesso: ACESSO_LOJA }, preHandler: guardaLoja(app) }
  const lojaGerir = { config: { acesso: ACESSO_LOJA }, preHandler: guardaGerir(app) }
  const lojaSensivel = {
    config: { acesso: ACESSO_LOJA, rateLimit: LIMITE_SENSIVEL },
    preHandler: guardaGerir(app),
  }

  // POST /numeros: conclui o Embedded Signup (dono e gerente). SEC-101: rate limit.
  r.post(
    '/',
    { ...lojaSensivel, schema: { body: numeroConectarEntrada, response: { 201: numeroSaida } } },
    async (req, reply) => {
      const b = req.body
      const saida = await service.conectar(app.pool, obterDeps(), {
        lojaId: lojaAtiva(req),
        codigo: b.codigo,
        wabaId: b.waba_id,
        phoneNumberId: b.phone_number_id,
      })
      // Log so com ids/estado; nunca o token nem o numero (SEC-024).
      req.log.info({ numero_id: saida.id, loja_id: saida.loja_id, acao: 'conectado' }, 'numero conectado')
      void reply.code(201)
      return saida
    },
  )

  // GET /numeros: lista da loja ativa.
  r.get('/', { ...loja, schema: { response: { 200: listaNumerosSaida } } }, async (req) => ({
    numeros: await service.listar(app.pool, lojaAtiva(req)),
  }))

  // GET /numeros/:id: detalhe (404 fora do escopo).
  r.get(
    '/:id',
    { ...loja, schema: { params: numeroIdParam, response: { 200: numeroSaida } } },
    async (req) => service.detalhar(app.pool, lojaAtiva(req), req.params.id),
  )

  // PATCH /numeros/:id/status: pausar, reativar, remover (sem DELETE).
  r.patch(
    '/:id/status',
    {
      ...lojaGerir,
      schema: { params: numeroIdParam, body: numeroStatusEntrada, response: { 200: numeroSaida } },
    },
    async (req) => {
      const saida = await service.mudarStatus(app.pool, lojaAtiva(req), req.params.id, req.body.acao)
      req.log.info({ numero_id: saida.id, loja_id: saida.loja_id, acao: req.body.acao }, 'numero status')
      return saida
    },
  )

  // POST /numeros/:id/reconectar: rotaciona o token. SEC-101: rate limit.
  r.post(
    '/:id/reconectar',
    {
      ...lojaSensivel,
      schema: {
        params: numeroIdParam,
        body: numeroReconectarEntrada,
        response: { 200: numeroSaida },
      },
    },
    async (req) => {
      const saida = await service.reconectar(
        app.pool,
        obterDeps(),
        lojaAtiva(req),
        req.params.id,
        req.body.codigo,
      )
      req.log.info({ numero_id: saida.id, loja_id: saida.loja_id, acao: 'reconectado' }, 'numero reconectado')
      return saida
    },
  )
}

/** Membro autenticado, escopo de loja resolvido e permissao de gestao da loja. */
function guardaLoja(app: FastifyInstance) {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('numeros_whatsapp:ver')]
}

/** Escrita (conectar, status, reconectar): `numeros_whatsapp:gerir`. */
function guardaGerir(app: FastifyInstance) {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('numeros_whatsapp:gerir')]
}

/** Plugin de PRODUCAO: resolve deps preguicosamente de `app.env` (MASTER_KEY + Meta). */
export const numerosRoutes: FastifyPluginAsync = async (app) => {
  let cache: DepsNumeros | null = null
  registrar(app, () => (cache ??= depsDeProducao(app.env)))
}

/** Fabrica para TESTE: injeta `onboarding` (stub) e `cripto` com chave de teste. */
export function criarRotasNumeros(deps: DepsNumeros): FastifyPluginAsync {
  return async (app) => {
    registrar(app, () => deps)
  }
}
