import type { FastifyPluginAsync } from 'fastify'
import { ErroEnvio } from '../../shared/baileys_client'
import { assinaturaValida } from './verificar_assinatura'

interface CorpoHook {
  user?: { phone?: string | null }
  sms?: { otp?: string }
}

// Texto do OTP (Fase 1, no código). Na Fase 2 vira um template editável no admin.
//
// H1.2/H1.3: a copy varia conforme o número JÁ tem cadastro (login) ou é novo
// (cadastro). Sem travessão, gênero neutro, sem palavras proibidas. O código nunca
// é logado; só entra na mensagem entregue.
//
// No CADASTRO (número novo) a mensagem também pede para salvar o contato: como o
// Whaviso usa um número próprio (Baileys), é por aqui que as mensagens vão chegar, e
// salvar o contato melhora o reconhecimento e a entrega das conversas seguintes.
const textoOtpLogin = (codigo: string): string =>
  `Whaviso: identificamos uma tentativa de login com seu número. Seu código de acesso é: ${codigo}\n\nSe não foi você, ignore esta mensagem. Não compartilhe este código com ninguém.`

const textoOtpCadastro = (codigo: string): string =>
  `Olá, aqui é o Whaviso. Identificamos uma tentativa de cadastro com seu número. Seu código para confirmar é: ${codigo}\n\nSalve este contato: as mensagens do Whaviso chegam sempre por aqui.\n\nSe não foi você, ignore esta mensagem. Não compartilhe este código com ninguém.`

/**
 * Endpoint do Send SMS Hook do Supabase. O Supabase gera o OTP do login por
 * telefone e POSTa aqui; entregamos o código pelo nosso WhatsApp (Baileys).
 * Resposta vazia 200 = sucesso (contrato do hook); não-200 = falha (o usuário
 * pode pedir o código de novo). Com Baileys o OTP deixa de ser gated por
 * verificação de empresa na Meta.
 */
export const hookOtpRoutes: FastifyPluginAsync = async (app) => {
  app.post('/hooks/sms', async (req, reply) => {
    const secret = app.env.SEND_SMS_HOOK_SECRET
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

    // H1.2/H1.3: número já cadastrado → copy de LOGIN; número novo → copy de CADASTRO.
    // profiles.telefone está em E.164 (+55...); o hook recebe só dígitos. Falha de
    // consulta cai em cadastro (mais conservador: não promete login a quem não tem conta).
    let jaCadastrado = false
    try {
      const { rows } = await app.pool.query<{ existe: boolean }>(
        `select exists(select 1 from public.profiles where telefone = $1) as existe`,
        [`+${telefone}`],
      )
      jaCadastrado = rows[0]?.existe ?? false
    } catch {
      jaCadastrado = false
    }
    const texto = jaCadastrado ? textoOtpLogin(codigo) : textoOtpCadastro(codigo)

    try {
      await app.whats.enviarTexto(telefone, texto)
    } catch (erro) {
      // Nunca logar o código nem o telefone (Regras de Ouro). Só o motivo.
      const motivo = erro instanceof ErroEnvio ? `envio_${erro.codigo}` : 'erro_envio'
      req.log.error({ motivo }, 'falha ao entregar OTP por WhatsApp')
      return reply.status(502).send({ error: motivo })
    }

    return reply.status(200).send({})
  })
}
