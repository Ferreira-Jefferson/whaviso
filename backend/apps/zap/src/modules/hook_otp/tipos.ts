// Dependencias do modulo hook_otp (ZAP-hook-otp). Injetadas pelo app-root (como no webhook):
// o modulo nunca le `app.whats`/`app.env` por decorator nem importa outro modulo.
import type { ClienteWhats } from '@whaviso/shared/clientes'
import type { Pool } from '@whaviso/shared/db'

export interface DepsHookOtp {
  /** Pool do zap (role whaviso_zap): auditoria append-only em eventos_auth. */
  pool: Pool
  /** Transporte WhatsApp (Meta Cloud API) por tras do contrato ClienteWhats. */
  whats: ClienteWhats
  /** Segredo do Send SMS Hook (whsec_...). Ausente -> a rota responde 503 (recurso desligado). */
  hookSecret: string | undefined
  /** Numero remetente da PLATAFORMA (credenciais META_* do proprio zap). Login nao tem loja. */
  phoneNumberId: string | undefined
  accessToken: string | undefined
  /** Template AUTHENTICATION aprovado na Meta (nome) e idioma. */
  templateOtp: string
  idiomaOtp: string
}
