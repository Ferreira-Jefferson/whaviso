// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/eventos.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

import { z } from 'zod'
import { UuidSchema, DataHoraIso } from './primitivos'
import { statusPedido, direcaoMensagem, autorMensagem, statusConversa } from './enums'

// Eventos de domínio e canais de realtime (F1). O realtime da api é SSE sobre
// `LISTEN/NOTIFY` do Postgres (F5); o front (F6) consome estes payloads. Regra dura:
// o payload NUNCA carrega PII (telefone, token, chave, nome/endereço do cliente, conteúdo
// da mensagem). O canal é lido pelo navegador; dado ao vivo e sensível não trafega aqui,
// o front busca o detalhe por endpoint autenticado quando precisa. Schemas `strict`
// rejeitam qualquer chave desconhecida, então um payload com `telefone` é recusado.

export const EventoPedidoAtualizado = z
  .object({ pedido_id: UuidSchema, loja_id: UuidSchema, status: statusPedido })
  .strict()
export type EventoPedidoAtualizado = z.infer<typeof EventoPedidoAtualizado>

// Sinaliza que chegou/saiu mensagem numa conversa; sem o conteúdo nem o telefone.
export const EventoConversaMensagem = z
  .object({
    conversa_id: UuidSchema,
    loja_id: UuidSchema,
    direcao: direcaoMensagem,
    autor: autorMensagem,
  })
  .strict()
export type EventoConversaMensagem = z.infer<typeof EventoConversaMensagem>

export const EventoConversaHandoff = z
  .object({ conversa_id: UuidSchema, loja_id: UuidSchema, status: statusConversa })
  .strict()
export type EventoConversaHandoff = z.infer<typeof EventoConversaHandoff>

// Mapa tipo-do-evento -> schema do payload. Fonte única do contrato de realtime: o
// produtor (api) valida contra ele antes do NOTIFY; o consumidor (front) contra o mesmo.
export const CANAIS_REALTIME = {
  'pedido.atualizado': EventoPedidoAtualizado,
  'conversa.mensagem': EventoConversaMensagem,
  'conversa.handoff': EventoConversaHandoff,
} as const

export const tipoEvento = z.enum([
  'pedido.atualizado',
  'conversa.mensagem',
  'conversa.handoff',
])
export type TipoEvento = z.infer<typeof tipoEvento>

// Envelope genérico de um evento de domínio no barramento (auditoria/realtime).
export const EventoDominio = z
  .object({
    tipo: tipoEvento,
    loja_id: UuidSchema,
    ocorrido_em: DataHoraIso,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict()
export type EventoDominio = z.infer<typeof EventoDominio>

/** Valida um payload contra o schema do seu canal de realtime. */
export function validarEvento(tipo: TipoEvento, payload: unknown) {
  return CANAIS_REALTIME[tipo].safeParse(payload)
}
