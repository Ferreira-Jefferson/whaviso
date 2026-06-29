// Provider WhatsApp pela Meta Cloud API, atrás do contrato ClienteWhats. Sem socket,
// sem QR, sem ritmo anti-bloqueio (a Meta tem rate-limit próprio): "conectado" = token +
// phone_id válidos. O inbound (botões/texto/recibos de status) chega por WEBHOOK HTTP,
// montado por montarRotaWebhook; o cliente só DESPACHA aos handlers que o app-root ligou
// (onBotao/onTexto/onStatus). A regra de negócio segue no módulo webhook_whatsapp.
import type { FastifyInstance } from 'fastify'
import type { Logger } from '@whaviso/shared/logger'
import type { Pool } from '@whaviso/shared/db'
import {
  type ClienteWhats,
  type HandlerBotao,
  type HandlerStatus,
  type HandlerTexto,
  type MensagemWhats,
} from '../whats'
import { gravarSessao } from '../sessao'
import { enviarGraph, saudeGraph } from './graph'
import { assinaturaMetaValida } from './verificar_assinatura'
import { extrairEventosWebhook } from './inbound'
import type { OpcoesMeta, PayloadWebhook } from './tipos'

export type { OpcoesMeta } from './tipos'

export interface ClienteWhatsMeta extends ClienteWhats {
  /** registra GET/POST /webhook/whatsapp no app (handshake + eventos). */
  montarRotaWebhook(app: FastifyInstance): void
}

export interface DepsClienteMeta {
  logger: Logger
  pool: Pool
}

const TIPO_MIDIA = { imagem: 'image', video: 'video', audio: 'audio', documento: 'document' } as const

/** Traduz a MensagemWhats no body do Graph: template, interactive, mídia ou texto. */
export function montarBody(m: MensagemWhats): Record<string, unknown> {
  const to = m.para.replace(/\D/g, '')

  if (m.template) {
    const components: Record<string, unknown>[] = []
    if (m.template.parametros.length) {
      components.push({
        type: 'body',
        parameters: m.template.parametros.map((t) => ({ type: 'text', text: t })),
      })
    }
    ;(m.template.botoesPayload ?? []).forEach((payload, index) => {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index,
        parameters: [{ type: 'payload', payload }],
      })
    })
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: m.template.nome,
        language: { code: m.template.idioma },
        ...(components.length ? { components } : {}),
      },
    }
  }

  if (m.midia) {
    const tipo = TIPO_MIDIA[m.midia.tipo]
    const mid: Record<string, unknown> = { link: m.midia.url }
    if (m.texto && m.midia.tipo !== 'audio') mid.caption = m.texto
    return { messaging_product: 'whatsapp', to, type: tipo, [tipo]: mid }
  }

  if (m.botoes?.length) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: m.texto },
        action: {
          buttons: m.botoes.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.rotulo } })),
        },
      },
    }
  }

  return { messaging_product: 'whatsapp', to, type: 'text', text: { body: m.texto, preview_url: false } }
}

export function criarClienteMeta(opcoes: OpcoesMeta, deps: DepsClienteMeta): ClienteWhatsMeta {
  const handlersBotao: HandlerBotao[] = []
  const handlersTexto: HandlerTexto[] = []
  const handlersStatus: HandlerStatus[] = []
  let conectado = false
  let numero: string | undefined

  async function conectar(): Promise<void> {
    try {
      const r = await saudeGraph(opcoes)
      conectado = true
      numero = r.numero
      await gravarSessao(deps.pool, { status: 'conectado', numero: r.numero ?? null, qr: null }).catch(
        () => undefined,
      )
      deps.logger.info({ numero: r.numero }, 'WhatsApp (Meta Cloud API) pronto')
    } catch (e) {
      conectado = false
      await gravarSessao(deps.pool, { status: 'desconectado' }).catch(() => undefined)
      deps.logger.error({ err: e }, 'falha ao validar as credenciais da Meta Cloud API')
    }
  }

  async function enviar(m: MensagemWhats): Promise<{ wamid: string }> {
    const r = await enviarGraph(opcoes, montarBody(m))
    conectado = true // um envio ok confirma token/phone válidos
    return r
  }

  async function processarWebhook(rawBody: Buffer): Promise<void> {
    try {
      const payload = JSON.parse(rawBody.toString('utf8')) as PayloadWebhook
      const { botoes, textos, statuses } = extrairEventosWebhook(payload)
      for (const e of botoes)
        for (const h of handlersBotao)
          await h(e).catch((err) => deps.logger.error({ err }, 'erro no handler de botão'))
      for (const e of textos)
        for (const h of handlersTexto)
          await h(e).catch((err) => deps.logger.error({ err }, 'erro no handler de texto'))
      for (const e of statuses)
        for (const h of handlersStatus)
          await h(e).catch((err) => deps.logger.error({ err }, 'erro no handler de status'))
    } catch (e) {
      deps.logger.error({ err: e }, 'falha ao processar o webhook da Meta')
    }
  }

  function montarRotaWebhook(app: FastifyInstance): void {
    // Handshake de verificação (Meta valida a URL ecoando o challenge).
    app.get('/webhook/whatsapp', async (req, reply) => {
      const q = req.query as Record<string, string | undefined>
      if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === opcoes.verifyToken) {
        return reply.type('text/plain').send(q['hub.challenge'] ?? '')
      }
      return reply.status(403).send()
    })
    // Eventos: valida assinatura -> 200 imediato -> processa em background.
    app.post('/webhook/whatsapp', async (req, reply) => {
      const rawBody = (req as { rawBody?: Buffer }).rawBody
      const assinatura = req.headers['x-hub-signature-256'] as string | undefined
      if (!rawBody || !assinaturaMetaValida(rawBody, assinatura, opcoes.appSecret)) {
        return reply.status(401).send()
      }
      void processarWebhook(rawBody)
      return reply.status(200).send()
    })
  }

  return {
    conectar,
    parar: async () => undefined,
    desconectar: async () => {
      conectado = false
      await gravarSessao(deps.pool, { status: 'desconectado', numero: null, qr: null }).catch(
        () => undefined,
      )
    },
    enviarMensagem: (m) => enviar(m),
    enviarTexto: (para, texto) => enviar({ para, texto }),
    onBotao: (cb) => {
      handlersBotao.push(cb)
    },
    onTexto: (cb) => {
      handlersTexto.push(cb)
    },
    onStatus: (cb) => {
      handlersStatus.push(cb)
    },
    status: () => ({ conectado, numero }),
    montarRotaWebhook,
  }
}
