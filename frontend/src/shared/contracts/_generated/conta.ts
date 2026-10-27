// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/conta.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo conta (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos (SEC-081): z.strictObject, tamanhos e enums fechados.
// O enum de papel e o do kernel (`dono|gerente|atendente`): nunca contem operador/admin (SEC-041).
import { z } from 'zod'
import { papelMembro } from './enums'
import { UuidSchema, DataHoraIso } from './primitivos'

const uuid = UuidSchema
const dataHora = DataHoraIso
const nome = z.string().trim().min(1).max(120)

export const ContaCriarEntrada = z.strictObject({ nome })
export const ContaAtualizarEntrada = z.strictObject({ nome })
export const ContaSaida = z.strictObject({
  id: uuid,
  nome: z.string(),
  criado_em: dataHora,
})

export const MembroSaida = z.strictObject({
  id: uuid,
  user_id: uuid,
  loja_id: uuid.nullable(),
  papel: papelMembro,
  ativo: z.boolean(),
  criado_em: dataHora,
})
export const MembrosSaida = z.strictObject({ membros: z.array(MembroSaida) })

export const MembroPapelAtualizarEntrada = z
  .strictObject({ papel: papelMembro.optional(), ativo: z.boolean().optional() })
  .refine((v) => v.papel !== undefined || v.ativo !== undefined, {
    message: 'Informe papel e/ou ativo',
  })

export const ConviteCriarEntrada = z.strictObject({
  papel: papelMembro,
  /** null/ausente = todas as lojas da conta. */
  loja_id: uuid.nullable().optional(),
})
export const ConviteSaida = z.strictObject({
  id: uuid,
  loja_id: uuid.nullable(),
  papel: papelMembro,
  expira_em: dataHora,
  criado_em: dataHora,
  /** So na criacao, uma unica vez. */
  link: z.string().optional(),
})
export const ConvitesSaida = z.strictObject({ convites: z.array(ConviteSaida) })

export const ConviteAceitarEntrada = z.strictObject({
  token: z
    .string()
    .min(16)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
})
export const ConviteAceitarSaida = z.strictObject({
  membro_id: uuid,
  conta_id: uuid,
  loja_id: uuid.nullable(),
  papel: papelMembro,
})

export type ContaCriarEntradaT = z.infer<typeof ContaCriarEntrada>
export type MembroPapelAtualizarEntradaT = z.infer<typeof MembroPapelAtualizarEntrada>
export type ConviteCriarEntradaT = z.infer<typeof ConviteCriarEntrada>
