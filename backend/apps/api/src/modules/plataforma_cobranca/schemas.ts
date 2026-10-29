// Contratos de borda do modulo plataforma_cobranca. Fonte unica dos DTOs/entradas:
// @whaviso/shared/contracts/plataforma_cobranca (o codegen reemite para o front quando o barrel
// passar a reexportar o agregado). Aqui ficam so o parametro de rota :id e os filtros de query.
import { z } from 'zod'
import { Centavos, CompetenciaMes, statusAssinatura, statusFatura } from '@whaviso/shared/contracts'

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

// ---- Planos (catalogo; admin) ---------------------------------------------------------------

const Inclui = z.array(z.string().trim().min(1).max(120)).max(30)

export const PlanoDTO = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  valor_centavos: Centavos,
  inclui: z.array(z.string()),
  ativo: z.boolean(),
  /** Override da taxa de intermediacao (centavos); NULL = herda o padrao da plataforma. */
  taxa_intermediacao_centavos: Centavos.nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})
export type PlanoDTO = z.infer<typeof PlanoDTO>
export const PlanosLista = z.array(PlanoDTO)

export const PlanoCriar = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  valor_centavos: Centavos,
  inclui: Inclui.default([]),
  ativo: z.boolean().default(true),
  /** NULL (ou ausente) = herda o padrao da plataforma; numero = override (0 = taxa zero). */
  taxa_intermediacao_centavos: Centavos.nullable().default(null),
})
export type PlanoCriar = z.infer<typeof PlanoCriar>

export const PlanoPatch = z
  .strictObject({
    nome: z.string().trim().min(1).max(80).optional(),
    valor_centavos: Centavos.optional(),
    inclui: Inclui.optional(),
    ativo: z.boolean().optional(),
    /** Presente = altera (null limpa o override, voltando a herdar); ausente = nao mexe. */
    taxa_intermediacao_centavos: Centavos.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'informe ao menos um campo para alterar' })
export type PlanoPatch = z.infer<typeof PlanoPatch>

// ---- Config da plataforma: taxa de intermediacao PADRAO (fallback de todos os planos) ----------

export const ConfigTaxaDTO = z.strictObject({
  taxa_intermediacao_padrao_centavos: Centavos,
  atualizado_em: z.string(),
})
export type ConfigTaxaDTO = z.infer<typeof ConfigTaxaDTO>

export const ConfigTaxaPatch = z.strictObject({
  taxa_intermediacao_padrao_centavos: Centavos,
})
export type ConfigTaxaPatch = z.infer<typeof ConfigTaxaPatch>
