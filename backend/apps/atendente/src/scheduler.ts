// Scheduler do atendente (app-root pode chamar modulos; modulo nunca chama modulo). O trabalho de
// cada tick (drenar o inbound) e injetado como `tick`. Ticks nao se sobrepoem: o proximo so e
// agendado depois que o anterior termina (setTimeout encadeado); a parada e limpa e idempotente.
import type { Logger } from '@whaviso/shared/logger'

export interface DepsScheduler {
  logger: Logger
  intervaloMs: number
  /** Trabalho de um tick; rejeicoes sao logadas e nao derrubam o laco. */
  tick: () => Promise<void>
}

export interface Scheduler {
  parar(): void
}

export function iniciarScheduler(deps: DepsScheduler): Scheduler {
  let parado = false
  let timer: NodeJS.Timeout | undefined

  async function rodar(): Promise<void> {
    try {
      await deps.tick()
    } catch (erro) {
      deps.logger.error({ err: erro }, 'erro no tick do scheduler')
    } finally {
      if (!parado) timer = setTimeout(() => void rodar(), deps.intervaloMs)
    }
  }

  void rodar()

  return {
    parar() {
      parado = true
      if (timer) clearTimeout(timer)
    },
  }
}
