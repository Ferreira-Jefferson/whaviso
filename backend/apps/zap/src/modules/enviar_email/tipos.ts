// Tipos e defaults do dreno de e-mail (sem logica nem import de ./service, para o modulo nao
// formar ciclo de import em runtime).
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import type { ClienteEmail } from './cliente_resend'

export interface ConfigDrenoEmail {
  /** quantos e-mails reivindicar por tick. */
  tamanhoLote: number
  /** teto de tentativas antes de `falhou`. */
  maxTentativas: number
  /** `processando` mais velho que isto volta a `agendado` (worker morto). */
  orfaoAposMs: number
  /** base do backoff (ms); cresce por tentativa (x2), com teto. */
  baseMs: number
  fator: number
  maxMs: number
}

export const CONFIG_PADRAO: ConfigDrenoEmail = {
  tamanhoLote: 10,
  maxTentativas: 5,
  orfaoAposMs: 2 * 60_000,
  baseMs: 60_000,
  fator: 2,
  maxMs: 60 * 60_000,
}

export interface DepsDrenoEmail {
  pool: Pool
  logger: Logger
  /** Cliente de e-mail; ausente = o dreno fica idle (nao envia, deixa a fila para quando houver). */
  cliente?: ClienteEmail
  config?: Partial<ConfigDrenoEmail>
}

/** Contagem por desfecho de um tick (so numeros; nunca PII). */
export interface ResumoDrenoEmail {
  idle: boolean
  orfaos: number
  reivindicados: number
  enviados: number
  reagendados: number
  falhas: number
}
