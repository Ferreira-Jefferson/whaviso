import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { statusTelefoneBody, statusTelefoneResposta } from '@whaviso/shared/contracts'
import { registrarEventoAuth } from '../../shared/eventos_auth'

/**
 * Auth (H1.2/H1.3): superfície mínima que o front precisa do BACKEND para o login por
 * WhatsApp. O JWT continua sendo do Supabase (OTP via Send SMS Hook → zap); aqui só
 * respondemos se um número já tem cadastro, para a UI escolher a copy (login vs
 * cadastro). Sem chat/IA: é um único GET-like POST público, rate-limited.
 */
export const authRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  // Limite apertado contra ENUMERAÇÃO de telefones: a resposta já revela o mínimo
  // (existe sim/não, exigido pela história); o rate-limit evita varrer a base.
  const limiteStatus = { rateLimit: { max: 12, timeWindow: '1 minute' } }

  app.post(
    '/auth/status-telefone',
    {
      config: limiteStatus,
      schema: { body: statusTelefoneBody, response: { 200: statusTelefoneResposta } },
    },
    async (req) => {
      const { telefone } = req.body
      const { rows } = await app.pool.query<{ existe: boolean }>(
        `select exists(select 1 from public.profiles where telefone = $1) as existe`,
        [telefone],
      )
      const existe = rows[0]?.existe ?? false
      // Auditoria sem PII: só o hash do telefone + o booleano. Best-effort (não derruba
      // a resposta se a gravação falhar). Vigia abuso de enumeração.
      await registrarEventoAuth(app.pool, 'status_consultado', telefone, { existe }).catch(
        () => undefined,
      )
      return { existe }
    },
  )
}
