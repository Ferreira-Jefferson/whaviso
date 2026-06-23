// Ingestão de inbound: extrai o clique de botão OU o texto de uma mensagem do socket.
// Botão: o devedor/convidado já ativo só age por botões (sem chat/IA). Texto: a 1ª
// mensagem do convite (número de 6 dígitos) e o fallback numerado (1/2/3) do E5; a
// regra de negócio (webhook_whatsapp) decide o que fazer com o texto (e ignora o que
// não for convite/fallback). O transporte não interpreta, só entrega.
import type { EventoBotao, EventoTexto } from './tipos'
import type { MensagemWA } from './tipos_fork'

export function extrairBotao(m: MensagemWA): EventoBotao | null {
  if (!m.message || m.key.fromMe) return null
  const buttonId =
    m.message.buttonsResponseMessage?.selectedButtonId ??
    m.message.templateButtonReplyMessage?.selectedId ??
    null
  const telefone = (m.key.remoteJid ?? '').replace(/\D/g, '')
  const wamid = m.key.id ?? ''
  if (!buttonId || !telefone) return null
  return { wamid, telefone, buttonId }
}

/** Texto puro de uma mensagem (conversation ou extendedTextMessage). null se não houver. */
export function extrairTexto(m: MensagemWA): EventoTexto | null {
  if (!m.message || m.key.fromMe) return null
  // Se a mensagem é um clique de botão, NÃO é texto (evita dupla entrega).
  if (m.message.buttonsResponseMessage || m.message.templateButtonReplyMessage) return null
  const texto = (m.message.conversation ?? m.message.extendedTextMessage?.text ?? '').trim()
  const telefone = (m.key.remoteJid ?? '').replace(/\D/g, '')
  const wamid = m.key.id ?? ''
  if (!texto || !telefone) return null
  return { wamid, telefone, texto }
}
