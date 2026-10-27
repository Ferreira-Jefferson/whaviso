// Contratos de borda do modulo plataforma_cobranca. Fonte unica dos DTOs/entradas:
// @whaviso/shared/contracts/plataforma_cobranca (o codegen reemite para o front quando o barrel
// passar a reexportar o agregado). Aqui ficam so o parametro de rota :id e os filtros de query.
import { z } from 'zod'
import { CompetenciaMes, statusAssinatura, statusFatura } from '@whaviso/shared/contracts'

export {
  AssinaturaDTO,
  AssinaturaCriar,
  AssinaturaPatch,
  AssinaturasLista,
  FaturaDTO,
  FaturasLista,
  FaturaMarcarPaga,
  MinhaFaturaDTO,
  MinhasFaturasLista,
  GerarFaturasEntrada,
  GerarFaturasResultado,
  ApurarAtrasosResultado,
  statusAssinatura,
  statusFatura,
  type StatusAssinatura,
  type StatusFatura,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })

/** Filtros da listagem de assinaturas (operador). */
export const AssinaturasQuery = z.strictObject({
  conta_id: z.uuid().optional(),
  status: statusAssinatura.optional(),
})
export type AssinaturasQuery = z.infer<typeof AssinaturasQuery>

/** Filtros da listagem de faturas (operador). */
export const FaturasQuery = z.strictObject({
  status: statusFatura.optional(),
  competencia: CompetenciaMes.optional(),
  conta_id: z.uuid().optional(),
})
export type FaturasQuery = z.infer<typeof FaturasQuery>
