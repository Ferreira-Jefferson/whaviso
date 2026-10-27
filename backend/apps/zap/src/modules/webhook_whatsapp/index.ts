// Modulo webhook_whatsapp (ZAP-webhook): inbound da Meta Cloud API. Registra o handshake
// (GET) e os eventos (POST) de /webhook/whatsapp. O POST valida a assinatura (HMAC do corpo
// CRU, via cliente endurecido), PERSISTE o inbound e so entao responde 200 a Meta. Trabalho
// fino: reivindicar (idempotencia por wamid), rotear por phone_number_id, upsert de cliente,
// garantir a conversa, inserir a mensagem e emitir o evento realtime; recibos atualizam envios.
// Este modulo nunca importa outro modulo; o app-root o liga via registrarWebhookWhatsapp.
import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { processarWebhook } from './service'
import type { PayloadWebhook } from './parse'
import type { DepsWebhook } from './tipos'

export { processarWebhook } from './service'
export { extrairEventos } from './parse'
export type { DepsWebhook, ResumoWebhook } from './tipos'
export type { PayloadWebhook } from './parse'

// Corpo do webhook da Meta e pequeno (poucos KB); 128KB cobre com folga e barra corpos gigantes
// de flood antes de bufferizar/computar o HMAC.
const WEBHOOK_BODY_LIMIT = 128 * 1024

/** Compara dois segredos em tempo constante (hasheia ambos p/ 32 bytes fixos), sem vazar por timing. */
function segredoConfere(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Registra GET/POST /webhook/whatsapp no app. O GET faz o handshake (ecoa hub.challenge quando o
 * verify_token confere); o POST valida a assinatura, persiste e responde 200.
 */
export function registrarWebhookWhatsapp(app: FastifyInstance, deps: DepsWebhook): void {
  // Handshake de verificacao: a Meta valida a URL ecoando o challenge.
  app.get('/webhook/whatsapp', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>
    const token = q['hub.verify_token']
    if (q['hub.mode'] === 'subscribe' && token && segredoConfere(token, deps.verifyToken)) {
      return reply.type('text/plain').send(q['hub.challenge'] ?? '')
    }
    return reply.status(403).send()
  })

  // Eventos: assinatura invalida -> 401 e descarte (sem log do corpo). bodyLimit apertado e
  // rate limit por IP mais generoso que o global (a Meta pode entregar em rajada legitima;
  // 429 forcaria reentrega). Persiste ANTES de 200: a Meta reentrega se nao receber 200.
  app.post(
    '/webhook/whatsapp',
    { bodyLimit: WEBHOOK_BODY_LIMIT, config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const assinatura = req.headers['x-hub-signature-256'] as string | undefined
      // Rejeita cedo o que nem traz header (flood): nem toca no corpo.
      if (!assinatura) return reply.status(401).send()
      const rawBody = (req as { rawBody?: Buffer }).rawBody
      if (!rawBody || !deps.verificarAssinatura(rawBody, assinatura)) {
        return reply.status(401).send()
      }
      // Corpo cru vazio (ping sem conteudo) com assinatura valida: 200 sem trabalho.
      const payload = (req.body ?? {}) as PayloadWebhook
      await processarWebhook(deps, payload)
      return reply.status(200).send()
    },
  )
}
