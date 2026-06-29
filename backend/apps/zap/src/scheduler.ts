// Orquestra os ticks do zap (app-root pode chamar módulos; módulo nunca chama módulo).
import type { Logger } from '@whaviso/shared/logger'
import type { Pool } from '@whaviso/shared/db'
import type { ClienteWhats } from './shared/whats'
import { processarEnviosDevidos } from './modules/enviar_lembretes'
import { processarTestesDevidos } from './modules/testar_envio'
import { expirarAvisos } from './modules/expirar_avisos'
import { processarNotificacoesCobrador } from './modules/notificar_cobrador'
import { processarNotificacoesBilling } from './modules/notificar_billing'
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
      // Mini-chat de teste do owner (diagnóstico): mesma fila/transporte, sem template.
      const testes = await processarTestesDevidos(deps)
      const expirados = await expirarAvisos(deps)
      const notificados = await processarNotificacoesCobrador(deps)
      // E11 H11.10: empurra a mensagem de compra de crédito (recarga) ao WhatsApp do usuário.
      const recargas = await processarNotificacoesBilling(deps)
      // E14: expira sessões de wizard de chave abandonadas (libera o aceite segurado).
      const sessoesPix = await expirarSessoesPix(deps)
      // E11 H11.6: devolve os holds de 24h vencidos (em_hold -> saldo_livre).
      const holds = await processarHoldsVencidos(deps.pool)
      if (enviados > 0 || testes > 0 || expirados > 0 || notificados > 0 || recargas > 0 || sessoesPix > 0 || holds > 0) {
        deps.logger.info({ enviados, testes, expirados, notificados, recargas, sessoesPix, holds }, 'tick do scheduler')
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
