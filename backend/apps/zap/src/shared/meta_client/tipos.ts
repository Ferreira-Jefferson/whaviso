// Tipos do payload da Meta Cloud API (request de envio, resposta e webhook). Mantemos
// uma superfície pequena e própria; o resto do zap depende só do contrato em shared/whats.

export interface OpcoesMeta {
  accessToken: string
  phoneNumberId: string
  /** id da WABA; usado só pelo sync de templates (não no envio). */
  wabaId: string
  appSecret: string
  verifyToken: string
  /** base do Graph; default https://graph.facebook.com */
  graphUrl: string
  /** versão da Graph API; ex.: 'v23.0' */
  apiVersion: string
}

/** Envelope de erro do Graph (tanto em respostas de envio quanto em statuses[].errors). */
export interface ErroGraph {
  code?: number
  error_subcode?: number
  message?: string
  error_data?: { details?: string }
}

export interface RespostaEnvioGraph {
  messages?: Array<{ id: string }>
  error?: ErroGraph
}

// ---- Webhook (entry[].changes[].value) ----

export interface ContextoWebhook {
  /** wamid da mensagem original a que este inbound responde. */
  id?: string
}

export interface MensagemWebhook {
  from?: string
  id?: string
  type?: string
  context?: ContextoWebhook
  text?: { body?: string }
  button?: { payload?: string; text?: string }
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
}

export interface StatusWebhook {
  id?: string
  status?: string
  recipient_id?: string
  errors?: ErroGraph[]
}

export interface ValorWebhook {
  messaging_product?: string
  messages?: MensagemWebhook[]
  statuses?: StatusWebhook[]
}

export interface MudancaWebhook {
  field?: string
  value?: ValorWebhook
}

export interface EntradaWebhook {
  id?: string
  changes?: MudancaWebhook[]
}

export interface PayloadWebhook {
  object?: string
  entry?: EntradaWebhook[]
}
