import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
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
    // Só o nginx do mesmo host faz proxy do loopback (ver deploy/nginx/whaviso.conf:
    // proxy_pass http://127.0.0.1:3002); confiar só no proxy loopback evita que um
    // X-Forwarded-For forjado corrompa o IP do cliente (e o rate limit por IP abaixo).
    trustProxy: 'loopback',
    loggerInstance: deps.logger,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Preserva o corpo cru p/ validar assinaturas de webhook: Standard Webhooks do
  // /hooks/send-code (Supabase) e X-Hub-Signature-256 do /webhook/whatsapp (Meta).
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

  // Rate limit por IP nos endpoints públicos (defesa contra flood; o zap é daemon único
  // sempre-ligado e crítico). Limite GENEROSO de propósito: o webhook da Meta pode chegar
  // em rajada legítima (recibos de status após um tick), então preferimos não devolver 429
  // a tráfego real. A rota do webhook sobe o limite ainda mais (ver montarRotaWebhook).
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

  // Health público minimalista: só liveness e se o transporte está conectado. NÃO expõe o
  // número do WhatsApp do negócio (PII / reconhecimento) mesmo que status() o traga.
  app.get('/healthz', async () => ({
    ok: true,
    servico: 'zap',
    whatsapp: { conectado: deps.whats.status().conectado },
  }))

  // Send SMS Hook do Supabase (OTP). O inbound do WhatsApp (botões/texto/status) chega
  // pela rota /webhook/whatsapp, montada pelo server.ts via whats.montarRotaWebhook(app).
  await app.register(hookOtpRoutes)

  return app
}
