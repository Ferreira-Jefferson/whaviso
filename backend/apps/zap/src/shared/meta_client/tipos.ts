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
  // Campos do field 'message_template_status_update' (aprovação/recusa de template).
  event?: string
  message_template_id?: number | string
  message_template_name?: string
  message_template_language?: string
  reason?: string
}

export interface MudancaWebhook {
  /** ex.: 'messages' (inbound/recibos) ou 'message_template_status_update'. */
  field?: string
  value?: ValorWebhook
}

/** Item do GET /{waba_id}/message_templates (reconcile do status real). */
export interface TemplateMetaListado {
  id?: string
  name?: string
  language?: string
  status?: string
  category?: string
}

export interface RespostaListaTemplates {
  data?: TemplateMetaListado[]
  error?: ErroGraph
}

/** Resposta do create/edit de template (POST message_templates / POST {template_id}). */
export interface RespostaTemplateGraph {
  id?: string
  status?: string
  category?: string
  success?: boolean
  error?: ErroGraph
}

export interface EntradaWebhook {
  id?: string
  changes?: MudancaWebhook[]
}

export interface PayloadWebhook {
  object?: string
  entry?: EntradaWebhook[]
}
