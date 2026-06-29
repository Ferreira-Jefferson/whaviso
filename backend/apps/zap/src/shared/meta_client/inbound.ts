// Mapeia o payload do webhook da Meta para os eventos internos do contrato (EventoBotao,
// EventoTexto, EventoStatus). Função PURA (sem rede/banco): o cliente Meta chama isto e
// despacha aos handlers que o app-root ligou via onBotao/onTexto/onStatus. A regra de
// negócio (parsear o payload do botão, aplicar a ação) segue no módulo webhook_whatsapp.
import type { EventoBotao, EventoStatus, EventoTexto } from '../whats'
import type { MensagemWebhook, PayloadWebhook, StatusWebhook } from './tipos'

const STATUS_VALIDOS = new Set(['sent', 'delivered', 'read', 'failed'])

const soDigitos = (s: string | undefined): string => (s ?? '').replace(/\D/g, '')

function botaoDe(m: MensagemWebhook): EventoBotao | null {
  // Botão de template (quick_reply) chega como type 'button' com button.payload; botão
  // interativo livre chega como interactive.button_reply.id. O payload é o nosso "acao:ref".
  const buttonId = m.button?.payload ?? m.interactive?.button_reply?.id
  const telefone = soDigitos(m.from)
  if (!buttonId || !telefone || !m.id) return null
  const e: EventoBotao = { wamid: m.id, telefone, buttonId }
  if (m.context?.id) e.contextoMsgId = m.context.id
  return e
}

function textoDe(m: MensagemWebhook): EventoTexto | null {
  const texto = (m.text?.body ?? '').trim()
  const telefone = soDigitos(m.from)
  if (!texto || !telefone || !m.id) return null
  const e: EventoTexto = { wamid: m.id, telefone, texto }
  if (m.context?.id) e.contextoMsgId = m.context.id
  return e
}

function statusDe(s: StatusWebhook): EventoStatus | null {
  if (!s.id || !s.status || !STATUS_VALIDOS.has(s.status)) return null
  const e: EventoStatus = { wamid: s.id, status: s.status as EventoStatus['status'] }
  const erro = s.errors?.[0]
  if (erro) e.erro = erro.message ?? (erro.code != null ? `erro_${erro.code}` : undefined)
  return e
}

export interface EventosWebhook {
  botoes: EventoBotao[]
  textos: EventoTexto[]
  statuses: EventoStatus[]
}

export function extrairEventosWebhook(payload: PayloadWebhook): EventosWebhook {
  const botoes: EventoBotao[] = []
  const textos: EventoTexto[] = []
  const statuses: EventoStatus[] = []

  for (const entrada of payload.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value
      if (!valor) continue
      for (const m of valor.messages ?? []) {
        // Botão/interactive tem prioridade sobre texto (uma resposta de botão não é texto).
        const botao = botaoDe(m)
        if (botao) {
          botoes.push(botao)
          continue
        }
        const texto = textoDe(m)
        if (texto) textos.push(texto)
      }
      for (const s of valor.statuses ?? []) {
        const st = statusDe(s)
        if (st) statuses.push(st)
      }
    }
  }
  return { botoes, textos, statuses }
}
