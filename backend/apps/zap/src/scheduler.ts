// Orquestra os ticks do zap (app-root pode chamar módulos; módulo nunca chama módulo).
import type { Logger } from '@whaviso/shared/logger'
import type { Pool } from '@whaviso/shared/db'
import type { ClienteWhats } from './shared/whats'
import type { OpcoesMeta } from './shared/meta_client'
import { submeterPendentes, reconciliarTemplates } from './modules/sincronizar_templates'

export interface DepsScheduler {
  pool: Pool
  logger: Logger
  whats: ClienteWhats
  intervaloMs: number
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
      // TODO(pivo): ticks do dominio de pedidos (outbox de envios) entram aqui.
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
      if (templates > 0) deps.logger.info({ templates }, 'tick do scheduler')
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
