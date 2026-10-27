// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/agendamento.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo agendamento (pedido para data/hora futura). Fonte unica (o codegen
// reemite para o front). `agendado_para` e um instante absoluto em ISO UTC; a loja exibe em
// America/Sao_Paulo. Dinheiro em centavos. Nenhum dado pessoal trafega aqui.
import { z } from 'zod'
import { Cursor, UuidSchema } from './primitivos'

const Uuid = UuidSchema
const DataHora = z.string().min(1)

/** Janela da agenda: `futuro` (ainda longe), `liberar` (dentro da antecedencia), `atrasado`. */
export const JanelaAgendamento = z.enum(['futuro', 'liberar', 'atrasado'])
export type JanelaAgendamentoValor = z.infer<typeof JanelaAgendamento>

export const AgendamentoDefinirEntrada = z.strictObject({
  agendado_para: z.iso.datetime({ offset: true }),
})
export type AgendamentoDefinir = z.infer<typeof AgendamentoDefinirEntrada>

export const AgendamentoSaida = z.strictObject({
  pedido_id: Uuid,
  codigo: z.string(),
  status: z.string(),
  modalidade: z.enum(['entrega', 'retirada']),
  total_centavos: z.number().int().nonnegative(),
  agendado_para: DataHora.nullable(),
  janela: JanelaAgendamento.nullable(),
})
export type AgendamentoDto = z.infer<typeof AgendamentoSaida>

export const AgendamentosEntrada = z.strictObject({
  /** Antecedencia (min) em que o pedido passa a ser `liberar` para a cozinha. */
  antecedencia_min: z.coerce.number().int().min(0).max(1440).default(60),
  de: z.iso.datetime({ offset: true }).optional(),
  ate: z.iso.datetime({ offset: true }).optional(),
  janela: JanelaAgendamento.optional(),
  cursor: Cursor.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
})
export type AgendamentosBusca = z.infer<typeof AgendamentosEntrada>

export const AgendamentosSaida = z.strictObject({
  itens: z.array(AgendamentoSaida),
  proximoCursor: z.string().nullable(),
})
