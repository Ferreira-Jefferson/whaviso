import Fastify from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import type { ClienteWhats } from './shared/whats'
import { hookOtpRoutes } from './modules/hook_otp'
import type { EnvZap } from './env'

declare module 'fastify' {
  interface FastifyInstance {
    pool: Pool
    env: EnvZap
    whats: ClienteWhats
  }
}

export interface DepsZap {
  env: EnvZap
  pool: Pool
  logger: Logger
  whats: ClienteWhats
}

export async function criarApp(deps: DepsZap) {
  const app = Fastify({
    loggerInstance: deps.logger,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Preserva o corpo cru p/ validar a assinatura Standard Webhooks do /hooks/send-code.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, corpo, done) => {
    ;(req as { rawBody?: Buffer }).rawBody = corpo as Buffer
    if ((corpo as Buffer).length === 0) return done(null, undefined)
    try {
      done(null, JSON.parse((corpo as Buffer).toString('utf8')))
    } catch (erro) {
      done(erro as Error)
    }
  })

  app.decorate('pool', deps.pool)
  app.decorate('env', deps.env)
  app.decorate('whats', deps.whats)

  app.get('/healthz', async () => ({ ok: true, servico: 'zap', whatsapp: deps.whats.status() }))

  // O inbound de botões do WhatsApp chega pelo socket do Baileys (ver server.ts),
  // não por webhook HTTP. Aqui só fica o Send SMS Hook do Supabase (OTP).
  await app.register(hookOtpRoutes)

  return app
}
