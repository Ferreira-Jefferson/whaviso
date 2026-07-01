// Orquestra os ticks do zap (app-root pode chamar módulos; módulo nunca chama módulo).
import type { Logger } from '@whaviso/shared/logger'
import type { Pool } from '@whaviso/shared/db'
import type { ClienteWhats } from './shared/whats'
import type { OpcoesMeta } from './shared/meta_client'
import { processarEnviosDevidos } from './modules/enviar_lembretes'
import { processarTestesDevidos } from './modules/testar_envio'
import { expirarAvisos } from './modules/expirar_avisos'
import { processarNotificacoesCobrador } from './modules/notificar_cobrador'
import { processarNotificacoesBilling } from './modules/notificar_billing'
import { expirarSessoesPix } from './modules/webhook_whatsapp'
import { submeterPendentes, reconciliarTemplates } from './modules/sincronizar_templates'
import { processarHoldsVencidos } from './shared/creditos'

export interface DepsScheduler {
  pool: Pool
  logger: Logger
  whats: ClienteWhats
  intervaloMs: number
  // Origem do SPA, repassada ao notificar_cobrador para a CTA de cadastro (H10.7).
  appUrl: string
  // Credenciais Meta para submeter/reconciliar templates; ausente = etapa desligada.
  metaOpcoes?: OpcoesMeta
}

// Reconcile da lista da Meta é rede de segurança (webhook é o caminho principal): roda em
// cadência baixa, 1 a cada N ticks, para não bater na Graph a cada 30s.
const TICKS_POR_RECONCILE = 20

export interface Scheduler {
  parar(): void
}

export function iniciarScheduler(deps: DepsScheduler): Scheduler {
  let parado = false
  let timer: NodeJS.Timeout | undefined
  let contaTicks = 0

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
      // Templates: submete os que o painel enfileirou; reconcilia o status real (cadência baixa).
      let templates = 0
      if (deps.metaOpcoes) {
        const sub = { pool: deps.pool, logger: deps.logger, metaOpcoes: deps.metaOpcoes }
        templates = await submeterPendentes(sub)
        contaTicks++
        if (contaTicks % TICKS_POR_RECONCILE === 0) {
          await reconciliarTemplates(sub).catch((e) =>
            deps.logger.warn({ err: e }, 'falha ao reconciliar templates com a Meta'),
          )
        }
      }
      if (enviados > 0 || testes > 0 || expirados > 0 || notificados > 0 || recargas > 0 || sessoesPix > 0 || holds > 0 || templates > 0) {
        deps.logger.info({ enviados, testes, expirados, notificados, recargas, sessoesPix, holds, templates }, 'tick do scheduler')
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
