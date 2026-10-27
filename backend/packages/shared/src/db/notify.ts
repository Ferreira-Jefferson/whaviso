// Publicador de realtime (F5): `pg_notify` num canal unico, payload validado por contrato.
// O NOTIFY e efemero (at-most-once): carrega so uma REFERENCIA (ids/status), nunca PII nem o
// dado completo. Quem produz dentro de uma transacao deve passar o client da transacao:
// o Postgres so entrega o NOTIFY no COMMIT (rollback = nada e publicado).
import { CANAIS_REALTIME, EventoDominio, type TipoEvento } from '../contracts'
import { consultar, type Executor } from './index'
import { sql } from './sql'

/** Canal Postgres unico do realtime. */
export const CANAL_EVENTOS = 'whaviso_eventos'
/** Limite do Postgres para o payload de NOTIFY e 8000 bytes; ficamos abaixo. */
export const LIMITE_NOTIFY_BYTES = 8000

export class ErroNotificar extends Error {
  constructor(public readonly motivo: 'evento_invalido' | 'payload_invalido' | 'loja_divergente' | 'grande_demais') {
    // Mensagem fixa: nunca ecoa o conteudo rejeitado (poderia conter PII).
    super(`notificar recusado: ${motivo}`)
    this.name = 'ErroNotificar'
  }
}

export interface EventoParaNotificar {
  tipo: TipoEvento
  loja_id: string
  payload: Record<string, unknown>
  /** ISO 8601; default agora. */
  ocorrido_em?: string
}

/** Valida e serializa; lanca `ErroNotificar` se invalido. Pura (testavel sem banco). */
export function serializarEvento(evento: EventoParaNotificar): string {
  const envelope = {
    tipo: evento.tipo,
    loja_id: evento.loja_id,
    ocorrido_em: evento.ocorrido_em ?? new Date().toISOString(),
    payload: evento.payload,
  }
  if (!EventoDominio.safeParse(envelope).success) throw new ErroNotificar('evento_invalido')
  // Schema strict por tipo: chave desconhecida (telefone, token, nome...) e recusada.
  if (!CANAIS_REALTIME[evento.tipo].safeParse(evento.payload).success) {
    throw new ErroNotificar('payload_invalido')
  }
  if ((evento.payload as { loja_id?: unknown }).loja_id !== evento.loja_id) {
    throw new ErroNotificar('loja_divergente')
  }
  const texto = JSON.stringify(envelope)
  if (Buffer.byteLength(texto, 'utf8') >= LIMITE_NOTIFY_BYTES) throw new ErroNotificar('grande_demais')
  return texto
}

/** Publica um evento de dominio no canal `whaviso_eventos`. */
export async function notificar(exec: Executor, evento: EventoParaNotificar): Promise<void> {
  const texto = serializarEvento(evento)
  await consultar(exec, sql`select pg_notify(${CANAL_EVENTOS}, ${texto})`)
}
