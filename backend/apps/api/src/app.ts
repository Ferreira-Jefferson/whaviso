import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { authPlugin } from './shared/auth'
import { tratadorDeErros } from './shared/http_errors'
import { registrarModulos } from './routes'
import { criarAdminSupabase, type AdminSupabase } from './shared/supabase_admin'
import type { EnvApi } from './env'

declare module 'fastify' {
  interface FastifyInstance {
    pool: Pool
    env: EnvApi
    /**
     * Admin API do Supabase (conta-no-aceite, H1.4). null quando a SERVICE ROLE KEY
     * não está configurada: o aceite cai no comportamento anterior (só vincula por
     * telefone), sem criar conta. Injetável nos testes.
     */
    adminSupabase: AdminSupabase | null
  }
}

export interface DepsApi {
  env: EnvApi
  pool: Pool
  logger: Logger
}

export async function criarApp(deps: DepsApi) {
  const app = Fastify({
    loggerInstance: deps.logger,
    // Só confia no proxy do loopback: a api binda em 127.0.0.1 e o nginx (mesmo host)
    // faz o proxy pelo loopback, anexando o IP real do cliente ao final do X-Forwarded-For
    // (via $proxy_add_x_forwarded_for; o IP real já vem do CF-Connecting-IP resolvido pelo
    // real_ip do nginx). Com 'loopback', req.ip volta a ser esse IP real (último hop não
    // confiável do XFF), restaurando o rate-limit por IP. 'true' confiaria na cadeia toda,
    // deixando o cliente forjar o IP e burlar o limite.
    trustProxy: 'loopback',
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(tratadorDeErros)

  app.decorate('pool', deps.pool)
  app.decorate('env', deps.env)
  app.decorate(
    'adminSupabase',
    deps.env.SUPABASE_SERVICE_ROLE_KEY
      ? criarAdminSupabase(deps.env.SUPABASE_URL, deps.env.SUPABASE_SERVICE_ROLE_KEY)
      : null,
  )

  // Cabeçalhos de segurança mínimos p/ API JSON: nosniff, frameguard DENY, no-referrer.
  // Sem CSP aqui (a api só devolve JSON; a CSP da SPA vive no nginx). COEP/CORP desligados
  // p/ não interferir no consumo por XHR/fetch da SPA.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    // HSTS é do edge (nginx/Cloudflare já mandam em api.whaviso.com); não duplicar aqui.
    hsts: false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  })
  // Auth é 100% via header Authorization: Bearer (não cookie), então CSRF não se aplica
  // e credentials seria inútil. origin restrito à origem única do APP_URL.
  await app.register(cors, { origin: deps.env.APP_URL })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(authPlugin, { supabaseUrl: deps.env.SUPABASE_URL, pool: deps.pool })

  app.get('/healthz', async () => ({ ok: true, servico: 'api' }))

  await app.register(registrarModulos, { prefix: '/v1' })

  return app
}
