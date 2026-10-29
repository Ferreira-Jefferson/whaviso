import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import type { Cifra } from '@whaviso/shared/cifra'
import type { ClienteWhats } from '@whaviso/shared/clientes'
import { registrarWebhookWhatsapp } from './modules/webhook_whatsapp'
import type { EnvZap } from './env'

declare module 'fastify' {
  interface FastifyInstance {
    pool: Pool
    env: EnvZap
  }
}

export interface DepsZap {
  env: EnvZap
  pool: Pool
  logger: Logger
  /** Cliente endurecido da Meta: o webhook usa so `verificarAssinatura` (HMAC do corpo cru). */
  whats: ClienteWhats
  /** Cifra do processo (mesma MASTER_KEY da api): hash/cifra do telefone do remetente no inbound.
   *  Ausente (harness sem MASTER_KEY): o webhook valida assinatura e aplica recibos, mas nao
   *  persiste mensagem de entrada (o server avisa). */
  cifra?: Cifra
}

export async function criarApp(deps: DepsZap) {
  const app = Fastify({
    // So o nginx do mesmo host faz proxy do loopback (ver deploy/nginx/whaviso.conf:
    // proxy_pass http://127.0.0.1:3002); confiar so no proxy loopback evita que um
    // X-Forwarded-For forjado corrompa o IP do cliente (e o rate limit por IP abaixo).
    trustProxy: 'loopback',
    loggerInstance: deps.logger,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Preserva o corpo cru p/ validar a assinatura do webhook: X-Hub-Signature-256 do
  // /webhook/whatsapp (Meta), que e HMAC-SHA256 sobre o corpo exato recebido.
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

  // Rate limit por IP nos endpoints publicos (defesa contra flood; o zap e daemon unico
  // sempre-ligado e critico). Limite GENEROSO de proposito: o webhook da Meta pode chegar
  // em rajada legitima (recibos de status apos um tick), entao preferimos nao devolver 429
  // a trafego real. A rota do webhook sobe o limite ainda mais (ver registrarWebhookWhatsapp).
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

  // Health publico minimalista: so liveness. NAO expoe numero/credencial (PII / reconhecimento).
  app.get('/healthz', async () => ({ ok: true, servico: 'zap' }))

  // Inbound do WhatsApp (handshake + eventos da Meta): assinatura via cliente endurecido, persiste
  // antes do 200 e emite o evento realtime. Idempotente por wamid.
  // O cast concilia o FastifyInstance do app (ZodTypeProvider/logger pino) com o tipo default
  // esperado pelo registrador do modulo (so usa app.get/app.post, agnosticos do provider).
  registrarWebhookWhatsapp(app as unknown as FastifyInstance, {
    pool: deps.pool,
    logger: deps.logger,
    cifra: deps.cifra,
    verificarAssinatura: (rawBody, header) => deps.whats.verificarAssinatura(rawBody, header),
    verifyToken: deps.env.META_VERIFY_TOKEN ?? '',
  })

  return app
}
