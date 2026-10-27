// Orquestra os ticks do zap (app-root pode chamar módulos; módulo nunca chama módulo).
import type { Logger } from '@whaviso/shared/logger'
import type { Pool } from '@whaviso/shared/db'
import type { ClienteWhats } from './shared/whats'

export interface DepsScheduler {
  pool: Pool
  logger: Logger
  whats: ClienteWhats
  intervaloMs: number
}

export interface Scheduler {
  parar(): void
}

export function iniciarScheduler(deps: DepsScheduler): Scheduler {
  let parado = false
  let timer: NodeJS.Timeout | undefined

  async function tick(): Promise<void> {
    try {
      // Esqueleto da fundação: os drenos entram em Onda 1 (ZAP-enviar drena a outbox
      // `envios` com claim FOR UPDATE SKIP LOCKED) e a reconciliação de templates em
      // Onda 2. Por ora o tick não faz trabalho de domínio.
      void deps.pool
      void deps.whats
    } catch (erro) {
      deps.logger.error({ err: erro }, 'erro no tick do scheduler')
    } finally {
      if (!parado) timer = setTimeout(() => void tick(), deps.intervaloMs)
    }
  }

  void tick()

  return {
    parar() {
      parado = true
      if (timer) clearTimeout(timer)
    },
  }
}
