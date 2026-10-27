import type { Pool } from '@whaviso/shared/db'
import type { ClienteWhats, EventoStatus } from '../../shared/whats'
import type { AdminSupabase } from '../../shared/supabase_admin'
import * as repo from './repo'

// Logger estrutural mínimo: aceita tanto o pino quanto o log do Fastify.
interface Log {
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}

export interface DepsInbound {
  pool: Pool
  logger: Log
  whats: ClienteWhats
  admin?: AdminSupabase | null
}

/**
 * Idempotência de reentrega: a Meta reentrega o mesmo evento se não vê o 200 a tempo.
 * Reivindica o wamid ANTES de processar (INSERT ... ON CONFLICT DO NOTHING); true na
 * primeira vez, false se já visto. Não se aplica aos recibos de status.
 * TODO(pivo): usar no inbound novo (texto/audio) quando for reescrito.
 */
export async function reivindicarEvento(pool: Pool, wamid: string): Promise<boolean> {
  const { rows } = await pool.query<{ wamid: string }>(
    `insert into public.webhook_eventos_processados (wamid) values ($1)
       on conflict (wamid) do nothing returning wamid`,
    [wamid],
  )
  return rows.length > 0
}

/** Recibo de entrega da Meta (sent/delivered/read/failed): atualiza envios.entrega_status. */
export async function processarStatus(deps: DepsInbound, evento: EventoStatus): Promise<void> {
  await repo.atualizarEntrega(deps.pool, evento.wamid, evento.status, evento.erro)
}
