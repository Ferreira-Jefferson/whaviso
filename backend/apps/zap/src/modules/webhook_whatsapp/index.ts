import { processarStatus, type DepsInbound } from './service'

/**
 * Liga o inbound do WhatsApp (Meta Cloud API, via webhook HTTP). Hoje só os recibos de
 * status (sent/delivered/read/failed -> envios.entrega_status) estão ligados. Chamado pelo
 * server.ts (app-root); o módulo não importa outro módulo.
 */
export function registrarInboundWhats(deps: DepsInbound): void {
  // TODO(pivo): reescrever inbound (rotear por phone_number_id, texto/audio/STT) no index.ts
  deps.whats.onStatus((evento) => processarStatus(deps, evento))
}

export type { DepsInbound }
