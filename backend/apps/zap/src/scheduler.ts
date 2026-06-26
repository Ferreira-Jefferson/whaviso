// Orquestra os ticks do zap (app-root pode chamar módulos; módulo nunca chama módulo).
import type { Logger } from '@whaviso/shared/logger'
import type { Pool } from '@whaviso/shared/db'
import type { ClienteWhats } from './shared/baileys_client'
import { processarEnviosDevidos } from './modules/enviar_lembretes'
import { expirarAvisos } from './modules/expirar_avisos'
import { processarNotificacoesCobrador } from './modules/notificar_cobrador'
import { expirarSessoesPix } from './modules/webhook_whatsapp'
import { processarHoldsVencidos } from './shared/creditos'

export interface DepsScheduler {
  pool: Pool
  logger: Logger
  whats: ClienteWhats
  intervaloMs: number
  // Origem do SPA, repassada ao notificar_cobrador para a CTA de cadastro (H10.7).
  appUrl: string
}

export interface Scheduler {
  parar(): void
}

export function iniciarScheduler(deps: DepsScheduler): Scheduler {
  let parado = false
  let timer: NodeJS.Timeout | undefined

  async function tick(): Promise<void> {
    try {
      const enviados = await processarEnviosDevidos(deps)
      const expirados = await expirarAvisos(deps)
      const notificados = await processarNotificacoesCobrador(deps)
      // E14: expira sessões de wizard de chave abandonadas (libera o aceite segurado).
      const sessoesPix = await expirarSessoesPix(deps)
      // E11 H11.6: devolve os holds de 24h vencidos (em_hold -> saldo_livre).
      const holds = await processarHoldsVencidos(deps.pool)
      if (enviados > 0 || expirados > 0 || notificados > 0 || sessoesPix > 0 || holds > 0) {
        deps.logger.info({ enviados, expirados, notificados, sessoesPix, holds }, 'tick do scheduler')
      }
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
