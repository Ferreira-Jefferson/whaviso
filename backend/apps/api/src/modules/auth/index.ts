import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { statusTelefoneBody, statusTelefoneResposta, verificarSessaoResposta } from '@whaviso/shared/contracts'
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
      let metodo: 'phone' | 'google' | null = null
      if (existe) {
        const { rows: mRows } = await app.pool.query<{ m: string | null }>(
          `select public.auth_provider_do_telefone($1) as m`,
          [telefone],
        )
        const raw = mRows[0]?.m ?? null
        metodo = raw === 'phone' || raw === 'google' ? raw : null
      }
      // Auditoria sem PII: só o hash do telefone + o booleano. Best-effort (não derruba
      // a resposta se a gravação falhar). Vigia abuso de enumeração.
      await registrarEventoAuth(app.pool, 'status_consultado', telefone, { existe, metodo }).catch(
        () => undefined,
      )
      return { existe, metodo }
    },
  )

  // Detecta e resolve conta split (phone-only criada pelo OTP quando já existe conta Google
  // com aquele telefone). Chamado pelo front logo após verificar o código OTP. Autenticado:
  // o JWT é do usuário phone-only recém-criado. Rate-limit moderado (um por login).
  app.post(
    '/auth/verificar-sessao',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      preHandler: [app.autenticar],
      schema: { response: { 200: verificarSessaoResposta } },
    },
    async (req) => {
      const phoneRaw = req.userPhone

      // Sessão Google (sem phone no JWT): nada a fazer.
      if (!phoneRaw) return { tipo: 'ok' as const }

      // O GoTrue guarda o telefone SEM o '+'; profiles.telefone é E.164 COM o '+'
      // (constraint profiles_telefone_e164). Normaliza para as duas pontas casarem;
      // sem isto o `where telefone = $1` abaixo nunca bate e o split some pro onboarding.
      const phone = `+${phoneRaw.replace(/^\+/, '')}`

      // O trigger handle_new_user cria um profile VAZIO (nome='', telefone=null) para TODO
      // usuário novo em auth.users; logo a mera existência da linha NÃO distingue um phone
      // user legítimo de uma conta phone recém-criada pelo OTP. O sinal certo é o próprio
      // telefone: se ESTE usuário já é o dono do número, é login normal (sem split).
      const { rows: selfRows } = await app.pool.query<{ telefone: string | null }>(
        `select telefone from public.profiles where id = $1`,
        [req.userId],
      )
      if (selfRows[0]?.telefone === phone) return { tipo: 'ok' as const }

      // Procura OUTRA conta que já é dona deste telefone (a conta Google preexistente).
      const { rows: outroRows } = await app.pool.query<{ id: string }>(
        `select id from public.profiles where telefone = $1 and id <> $2`,
        [phone, req.userId],
      )
      const contaExistente = outroRows[0]?.id
      if (!contaExistente) return { tipo: 'novo' as const }

      // Split detectado. Sem admin key: trata como novo (onboarding).
      if (!app.adminSupabase) return { tipo: 'novo' as const }
      const { magicToken } = await app.adminSupabase.mesclarContas(req.userId, contaExistente, phone)

      if (!magicToken) return { tipo: 'novo' as const }

      return { tipo: 'mesclado' as const, magic_token: magicToken }
    },
  )
}
