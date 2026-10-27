// Parser PURO do payload do webhook da Meta (Cloud API) para os eventos internos do
// inbound: mensagens de entrada e recibos de status. Sem rede e sem banco, 100% testavel.
// A regra de negocio (resolver loja/cliente/conversa, persistir) fica no service; aqui so
// traducao de estrutura. NUNCA loga: funcao pura que nem conhece logger.

/** Tipo da mensagem de entrada no vocabulario do banco (enum tipo_mensagem). */
export type TipoMensagemEntrada = 'texto' | 'audio' | 'imagem' | 'interativo' | 'outro'

/** Mensagem de entrada ja normalizada (uma por `messages[]` do webhook). */
export interface MensagemEntrada {
  /** id Meta do numero que recebeu (roteia a loja); de value.metadata.phone_number_id. */
  phoneNumberId: string
  /** id da mensagem na Meta (idempotencia + coluna mensagens.wamid). */
  wamid: string
  /** telefone do remetente, so digitos (Meta manda sem '+'); resolvido por hash no service. */
  telefone: string
  tipo: TipoMensagemEntrada
  /** texto/legenda/payload do botao; null quando nao ha texto (ex.: audio sem legenda). */
  conteudo: string | null
  /** id da midia na Meta (nunca o binario; o download fica no atendente). */
  midiaRef: string | null
}

/** Recibo de status de uma mensagem que ENVIAMOS (Meta statuses[]); casa por wamid em envios. */
export interface ReciboStatus {
  wamid: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  /** codigo curto do erro em falha (sem PII); null fora de falha. */
  erro: string | null
}

export interface EventosWebhook {
  mensagens: MensagemEntrada[]
  statuses: ReciboStatus[]
}

const STATUS_VALIDOS = new Set(['sent', 'delivered', 'read', 'failed'])
const soDigitos = (s: string | undefined): string => (s ?? '').replace(/\D/g, '')

// Estruturas minimas do payload da Meta que lemos (campos opcionais e defensivos).
interface MidiaWebhook {
  id?: string
  caption?: string
}
interface MensagemWebhook {
  id?: string
  from?: string
  type?: string
  text?: { body?: string }
  button?: { payload?: string; text?: string }
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
  image?: MidiaWebhook
  audio?: MidiaWebhook
  video?: MidiaWebhook
  document?: MidiaWebhook
}
interface StatusWebhook {
  id?: string
  status?: string
  errors?: Array<{ code?: number; message?: string }>
}
interface ValorWebhook {
  metadata?: { phone_number_id?: string }
  messages?: MensagemWebhook[]
  statuses?: StatusWebhook[]
}
interface MudancaWebhook {
  field?: string
  value?: ValorWebhook
}
export interface PayloadWebhook {
  entry?: Array<{ changes?: MudancaWebhook[] }>
}

/** Normaliza uma mensagem do webhook; null se nao tem o minimo (wamid + remetente). */
function mensagemDe(phoneNumberId: string, m: MensagemWebhook): MensagemEntrada | null {
  const telefone = soDigitos(m.from)
  if (!m.id || !telefone) return null
  const base = { phoneNumberId, wamid: m.id, telefone }

  // Botao de template (quick_reply) e resposta interativa sao "interativo": o payload (acao)
  // e o conteudo acionavel; o atendente interpreta.
  const payloadInterativo =
    m.button?.payload ??
    m.interactive?.button_reply?.id ??
    m.interactive?.list_reply?.id
  if (payloadInterativo || m.type === 'button' || m.type === 'interactive') {
    const titulo = m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title
    return { ...base, tipo: 'interativo', conteudo: payloadInterativo ?? titulo ?? null, midiaRef: null }
  }

  switch (m.type) {
    case 'text':
      return { ...base, tipo: 'texto', conteudo: m.text?.body?.trim() || null, midiaRef: null }
    case 'image':
      return { ...base, tipo: 'imagem', conteudo: m.image?.caption?.trim() || null, midiaRef: m.image?.id ?? null }
    case 'audio':
      return { ...base, tipo: 'audio', conteudo: null, midiaRef: m.audio?.id ?? null }
    default: {
      // sticker, video, document, location, contacts...: grava como 'outro' (nao descarta).
      const midiaRef = m.video?.id ?? m.document?.id ?? null
      return { ...base, tipo: 'outro', conteudo: null, midiaRef }
    }
  }
}

function statusDe(s: StatusWebhook): ReciboStatus | null {
  if (!s.id || !s.status || !STATUS_VALIDOS.has(s.status)) return null
  const err = s.errors?.[0]
  const erro = err ? (err.code != null ? `erro_${err.code}` : 'erro') : null
  return { wamid: s.id, status: s.status as ReciboStatus['status'], erro }
}

/** Extrai mensagens de entrada e recibos de status de um payload do webhook da Meta. */
export function extrairEventos(payload: PayloadWebhook): EventosWebhook {
  const mensagens: MensagemEntrada[] = []
  const statuses: ReciboStatus[] = []
  for (const entrada of payload.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value
      if (!valor) continue
      const phoneNumberId = valor.metadata?.phone_number_id
      if (phoneNumberId) {
        for (const m of valor.messages ?? []) {
          const normal = mensagemDe(phoneNumberId, m)
          if (normal) mensagens.push(normal)
        }
      }
      for (const s of valor.statuses ?? []) {
        const st = statusDe(s)
        if (st) statuses.push(st)
      }
    }
  }
  return { mensagens, statuses }
}
