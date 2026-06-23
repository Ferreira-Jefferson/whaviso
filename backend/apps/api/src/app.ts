import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
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
    trustProxy: true,
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

  await app.register(cors, { origin: deps.env.APP_URL, credentials: true })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(authPlugin, { supabaseUrl: deps.env.SUPABASE_URL, pool: deps.pool })

  app.get('/healthz', async () => ({ ok: true, servico: 'api' }))

  await app.register(registrarModulos, { prefix: '/v1' })

  return app
}
