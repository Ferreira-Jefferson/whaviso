// Rotas do modulo credenciais_plataforma (/v1/credenciais-plataforma/*). SO operador da
// plataforma (acesso: 'plataforma'), permissao `chaves_api:gerir` (mesma das demais credenciais
// de admin, ver pagamentos/routes.ts). Rate limit apertado nas rotas de escrita (SEC-101).
//
// Log: so metadado (phone_number_id, remetente, acao); o segredo NUNCA entra em log (SEC-024).
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { proibido } from '../../shared/http_errors'
import { EmailPlataformaEntrada, EmailPlataformaStatus, WhatsappOficialEntrada, WhatsappOficialStatus } from './schemas'
import type { DepsCredenciaisPlataforma } from './service'
import * as service from './service'
import { depsDeProducao } from './config'

const LIMITE_SENSIVEL = { max: 5, timeWindow: '1 minute' }

/** Operador autenticado (equipe Whaviso) exigido nas rotas de plataforma. */
function operadorAtivo(req: FastifyRequest): void {
  if (!req.operador) throw proibido('Escopo de operador ausente')
}

/** Monta as rotas com um resolvedor PREGUICOSO das dependencias (cifra). */
function registrar(app: FastifyInstance, obterDeps: () => DepsCredenciaisPlataforma): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  const plataforma = {
    config: { acesso: 'plataforma' as const, rateLimit: LIMITE_SENSIVEL },
    preHandler: [app.autenticar, app.escopoOperador, app.exigirPermissao('chaves_api:gerir')],
  }

  // GET /credenciais-plataforma/whatsapp-oficial: metadado (operador). NUNCA o access_token.
  r.get('/whatsapp-oficial', { ...plataforma, schema: { response: { 200: WhatsappOficialStatus } } },
    async (req) => {
      operadorAtivo(req)
      return service.statusWhatsappOficial(app.pool)
    })

  // PUT /credenciais-plataforma/whatsapp-oficial: set/rotate (operador). O token nunca volta nem e logado.
  r.put('/whatsapp-oficial',
    { ...plataforma, schema: { body: WhatsappOficialEntrada, response: { 200: WhatsappOficialStatus } } },
    async (req) => {
      operadorAtivo(req)
      const st = await service.definirWhatsappOficial(app.pool, obterDeps(), req.body)
      req.log.info(
        { phone_number_id: req.body.phone_number_id, acao: 'whatsapp_oficial_definido' },
        'credencial do numero oficial definida',
      )
      return st
    })

  // GET /credenciais-plataforma/email: metadado (operador). NUNCA a api key.
  r.get('/email', { ...plataforma, schema: { response: { 200: EmailPlataformaStatus } } },
    async (req) => {
      operadorAtivo(req)
      return service.statusEmailPlataforma(app.pool)
    })

  // PUT /credenciais-plataforma/email: set/rotate (operador). A chave nunca volta nem e logada.
  r.put('/email',
    { ...plataforma, schema: { body: EmailPlataformaEntrada, response: { 200: EmailPlataformaStatus } } },
    async (req) => {
      operadorAtivo(req)
      const st = await service.definirEmailPlataforma(app.pool, obterDeps(), req.body)
      req.log.info({ remetente: req.body.remetente, acao: 'email_plataforma_definido' }, 'credencial de e-mail definida')
      return st
    })
}

/** Plugin de PRODUCAO: resolve deps preguicosamente de `app.env` (MASTER_KEY). */
export const credenciaisPlataformaRoutes: FastifyPluginAsync = async (app) => {
  let cache: DepsCredenciaisPlataforma | null = null
  registrar(app, () => (cache ??= depsDeProducao(app.env)))
}

/** Fabrica para TESTE: injeta `cifra` (chave de teste). */
export function criarRotasCredenciaisPlataforma(deps: DepsCredenciaisPlataforma): FastifyPluginAsync {
  return async (app) => {
    registrar(app, () => deps)
  }
}
