// Tipos e defaults do dreno de envios (sem logica nem import de ./service, para o modulo
// nao formar ciclo de import em runtime).
import { POLITICA_WHATS, type ClienteWhats, type PoliticaRetry } from '@whaviso/shared/clientes'
import type { Cifra } from '@whaviso/shared/cifra'
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'

/** Parametros do dreno; defaults em CONFIG_PADRAO. */
export interface ConfigDreno {
  /** quantos envios reivindicar por tick. */
  tamanhoLote: number
  /** teto de tentativas antes de `falhou`. */
  maxTentativas: number
  /** `processando` mais velho que isto volta a `agendado` (worker morto). */
  orfaoAposMs: number
  /** politica de backoff (base, fator, jitter, maxMs). */
  retry: PoliticaRetry
}

export const CONFIG_PADRAO: ConfigDreno = {
  tamanhoLote: 10,
  maxTentativas: POLITICA_WHATS.retry.maxTentativas,
  orfaoAposMs: 2 * 60_000,
  retry: POLITICA_WHATS.retry,
}

export interface DepsDreno {
  pool: Pool
  whats: ClienteWhats
  cifra: Cifra
  logger: Logger
  config?: Partial<ConfigDreno>
  /** injecao para teste: fonte de aleatorio do jitter do backoff. */
  aleatorio?: () => number
}

/** Contagem por desfecho de um tick (so numeros; nunca PII). */
export interface ResumoDreno {
  orfaos: number
  reivindicados: number
  enviados: number
  reagendados: number
  falhas: number
}
