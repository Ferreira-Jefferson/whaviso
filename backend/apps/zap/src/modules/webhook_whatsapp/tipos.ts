// Tipos e dependencias do modulo webhook_whatsapp (inbound da Meta Cloud API).
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import type { Cifra } from '@whaviso/shared/cifra'

export interface DepsWebhook {
  pool: Pool
  logger: Logger
  /** Cifra do processo (mesma MASTER_KEY da api): hash/cifra do telefone do remetente. Sem ela
   *  o inbound de mensagem nao pode persistir (os recibos de status seguem funcionando). */
  cifra?: Cifra
  /** Valida a assinatura do webhook (X-Hub-Signature-256) sobre o corpo CRU (cliente endurecido). */
  verificarAssinatura: (rawBody: string | Uint8Array, header: string | undefined) => boolean
  /** Verify token do handshake (GET hub.verify_token); comparado em tempo constante. */
  verifyToken: string
}

/** Resumo do processamento de um payload (so contadores, nunca PII; util para log/teste). */
export interface ResumoWebhook {
  mensagens: number
  duplicadas: number
  descartadas: number
  recibos: number
  recibosIgnorados: number
}
