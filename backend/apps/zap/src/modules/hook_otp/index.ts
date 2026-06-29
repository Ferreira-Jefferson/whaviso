import type { FastifyPluginAsync } from 'fastify'
import { ErroEnvio } from '../../shared/whats'
import { assinaturaValida } from './verificar_assinatura'

interface CorpoHook {
  user?: { phone?: string | null }
  sms?: { otp?: string }
}

// Texto de fallback do OTP (só satisfaz o contrato MensagemWhats e documenta a copy; a
// Meta entrega pelo TEMPLATE de autenticação, não por este texto). Templates
// AUTHENTICATION têm formato fixo da Meta: não dá copy custom nem variar login/cadastro,
// então a antiga distinção H1.2/H1.3 e o "salve o contato" não cabem aqui. O código nunca
// é logado; só entra na mensagem entregue.
const textoOtp = (codigo: string): string =>
  `Seu código Whaviso é:\n\n*${codigo}*\n\nCaso não tenha solicitado, desconsidere esta mensagem.`

/**
 * Endpoint do Send SMS Hook do Supabase. O Supabase gera o OTP do login por telefone e
 * POSTa aqui; entregamos o código pelo WhatsApp via TEMPLATE AUTHENTICATION da Meta Cloud
 * API (nome em META_OTP_TEMPLATE). Resposta vazia 200 = sucesso (contrato do hook);
 * não-200 = falha (o usuário pode pedir o código de novo).
 */
export const hookOtpRoutes: FastifyPluginAsync = async (app) => {
  app.post('/hooks/send-code', async (req, reply) => {
    const secret = app.env.SEND_CODE_HOOK_SECRET
    if (!secret) {
      return reply.status(503).send({ error: 'hook_desligado' })
    }

    const rawBody = (req as { rawBody?: Buffer }).rawBody
    const ok =
      rawBody &&
      assinaturaValida(rawBody, {
        id: req.headers['webhook-id'] as string | undefined,
        timestamp: req.headers['webhook-timestamp'] as string | undefined,
        assinatura: req.headers['webhook-signature'] as string | undefined,
      }, secret)
    if (!ok) {
      return reply.status(401).send({ error: 'assinatura_invalida' })
    }

    const corpo = req.body as CorpoHook
    const telefone = (corpo.user?.phone ?? '').replace(/[^\d]/g, '')
    const codigo = corpo.sms?.otp
    if (!telefone || !codigo) {
      return reply.status(400).send({ error: 'payload_incompleto' })
    }

    // Supabase encerra o hook em 5 s; o envio pode levar mais. Respondemos 200 agora e
    // disparamos em background. O OTP vai por TEMPLATE AUTHENTICATION (o código entra no
    // corpo e no botão). Nunca logar o código nem o telefone (Regras de Ouro); só o motivo.
    app.whats
      .enviarMensagem({
        para: telefone,
        texto: textoOtp(codigo),
        template: {
          nome: app.env.META_OTP_TEMPLATE,
          idioma: app.env.META_OTP_IDIOMA,
          parametros: [codigo],
          autenticacao: true,
        },
      })
      .catch((erro) => {
        const motivo = erro instanceof ErroEnvio ? `envio_${erro.codigo}` : 'erro_envio'
        req.log.error({ motivo }, 'falha ao entregar OTP por WhatsApp')
      })

    return reply.status(200).send({})
  })
}
