// Modulo hook_otp (ZAP-hook-otp): endpoint do Send SMS Hook do Supabase para o login por
// telefone. O Supabase gera o OTP e POSTa em `POST /hooks/send-code`; aqui validamos a
// assinatura (Standard Webhooks) e entregamos o codigo pelo NOSSO WhatsApp via template
// AUTHENTICATION da Meta Cloud API (nome em META_OTP_TEMPLATE), sem provedor de SMS pago.
// Este modulo nunca importa outro modulo; o app-root o liga via registrarHookOtp.
//
// REGRA DE OURO: nunca logar telefone nem codigo. A auditoria (eventos_auth) guarda o
// telefone SO como sha256 e nunca o codigo.
import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { CredencialResolvida, ErroProvedor } from '@whaviso/shared/clientes'
import type { Pool } from '@whaviso/shared/db'
import { assinaturaValida } from './verificar_assinatura'
import type { DepsHookOtp } from './tipos'

export { assinaturaValida } from './verificar_assinatura'
export type { DepsHookOtp } from './tipos'

interface CorpoHook {
  user?: { phone?: string | null }
  sms?: { otp?: string }
}

type TipoOtp = 'otp_solicitado' | 'otp_entregue' | 'otp_falha_envio'

/** Codigo curto e estavel do erro de envio para a auditoria/log (sem PII). */
function motivoDe(erro: unknown): string {
  return erro instanceof ErroProvedor ? `${erro.tipo}:${erro.codigo}` : 'erro_envio'
}

/** Auditoria append-only; best-effort: nunca derruba o fluxo. Telefone so como sha256. */
async function auditar(
  pool: Pool,
  tipo: TipoOtp,
  telefoneHash: string,
  detalhes?: Record<string, unknown>,
): Promise<void> {
  try {
    await pool.query(
      `insert into public.eventos_auth (tipo, telefone_hash, detalhes) values ($1, $2, $3)`,
      [tipo, telefoneHash, detalhes ?? null],
    )
  } catch {
    // auditoria e consequencia, nunca bloqueia o login
  }
}

/**
 * Registra `POST /hooks/send-code`. Sem `hookSecret` -> 503 (desligado). Assinatura invalida
 * -> 401. Payload sem telefone/codigo -> 400. Caminho feliz: responde 200 na hora e entrega
 * o OTP em background pelo template AUTHENTICATION (o Supabase encerra o hook em ~5 s).
 */
export function registrarHookOtp(app: FastifyInstance, deps: DepsHookOtp): void {
  app.post('/hooks/send-code', async (req, reply) => {
    if (!deps.hookSecret) {
      return reply.status(503).send({ error: 'hook_desligado' })
    }
    // Sem credencial da plataforma nao da p/ enviar (o boot do zap ja exige META_*, mas o
    // harness pode nao ter): trata como indisponivel, sem vazar detalhe.
    if (!deps.phoneNumberId || !deps.accessToken) {
      req.log.error('hook OTP sem credencial META_* da plataforma')
      return reply.status(503).send({ error: 'hook_indisponivel' })
    }

    const rawBody = (req as { rawBody?: Buffer }).rawBody
    const assinaturaOk =
      !!rawBody &&
      assinaturaValida(
        rawBody,
        {
          id: req.headers['webhook-id'] as string | undefined,
          timestamp: req.headers['webhook-timestamp'] as string | undefined,
          assinatura: req.headers['webhook-signature'] as string | undefined,
        },
        deps.hookSecret,
      )
    if (!assinaturaOk) {
      return reply.status(401).send({ error: 'assinatura_invalida' })
    }

    const corpo = req.body as CorpoHook
    const digitos = (corpo.user?.phone ?? '').replace(/\D/g, '')
    const codigo = corpo.sms?.otp
    if (!digitos || !codigo) {
      return reply.status(400).send({ error: 'payload_incompleto' })
    }

    // E.164 (o contrato de envio exige o '+'); a auditoria hasheia essa forma canonica.
    const para = `+${digitos}`
    const telefoneHash = createHash('sha256').update(para).digest('hex')
    await auditar(deps.pool, 'otp_solicitado', telefoneHash)

    // O Supabase encerra o hook em ~5 s; o envio pela Meta pode levar mais. Respondemos 200
    // agora e entregamos em background. O codigo vai pelo TEMPLATE AUTHENTICATION (corpo + botao).
    const numero = {
      phoneNumberId: deps.phoneNumberId,
      credencial: new CredencialResolvida(deps.accessToken),
    }
    void deps.whats
      .enviarTemplateAutenticacao({
        numero,
        para,
        nome: deps.templateOtp,
        idioma: deps.idiomaOtp,
        codigo,
      })
      .then(async (r) => {
        if (r.ok) {
          await auditar(deps.pool, 'otp_entregue', telefoneHash)
        } else {
          const motivo = motivoDe(r.erro)
          await auditar(deps.pool, 'otp_falha_envio', telefoneHash, { motivo })
          req.log.error({ motivo }, 'falha ao entregar OTP por WhatsApp')
        }
      })
      .catch(async (erro) => {
        const motivo = motivoDe(erro)
        await auditar(deps.pool, 'otp_falha_envio', telefoneHash, { motivo })
        req.log.error({ motivo }, 'falha ao entregar OTP por WhatsApp')
      })

    return reply.status(200).send({})
  })
}
