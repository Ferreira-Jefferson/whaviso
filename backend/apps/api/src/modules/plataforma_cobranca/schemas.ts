// Contratos de borda do modulo plataforma_cobranca. Fonte unica dos DTOs/entradas:
// @whaviso/shared/contracts/plataforma_cobranca (o codegen reemite para o front quando o barrel
// passar a reexportar o agregado). Aqui ficam so o parametro de rota :id e os filtros de query.
import { z } from 'zod'
import { Centavos, CompetenciaMes, DiaVencimento, statusAssinatura, statusFatura } from '@whaviso/shared/contracts'

export {
  AssinaturaDTO,
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

// ---- Assinatura com plano (extensao local dos contratos compartilhados) ---------------------
// plano_id e OPCIONAL. Com plano e sem valor explicito, o valor do plano e COPIADO para a
// assinatura (valor_mensal_centavos): reajuste futuro do plano nao muda a fatura de quem assina.
// Valor informado manualmente continua valendo (comportamento anterior preservado).

export const AssinaturaCriar = z.strictObject({
  conta_id: z.uuid(),
  loja_id: z.uuid().nullable().optional(),
  status: z.enum(['trial', 'ativa']).default('trial'),
  plano_id: z.uuid().optional(),
  valor_mensal_centavos: Centavos.optional(),
  dia_vencimento: DiaVencimento.default(10),
  trial_ate: z.iso.datetime({ offset: true }).optional(),
})
export type AssinaturaCriar = z.infer<typeof AssinaturaCriar>

export const AssinaturaPatch = z
  .strictObject({
    status: statusAssinatura.optional(),
    plano_id: z.uuid().optional(),
    valor_mensal_centavos: Centavos.optional(),
    dia_vencimento: DiaVencimento.optional(),
  })
  .refine(
    (v) => v.status !== undefined || v.plano_id !== undefined || v.valor_mensal_centavos !== undefined
      || v.dia_vencimento !== undefined,
    { message: 'informe ao menos um campo para alterar' },
  )
export type AssinaturaPatch = z.infer<typeof AssinaturaPatch>

// ---- Planos (catalogo; admin) ---------------------------------------------------------------

const Inclui = z.array(z.string().trim().min(1).max(120)).max(30)

export const PlanoDTO = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  valor_centavos: Centavos,
  inclui: z.array(z.string()),
  ativo: z.boolean(),
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
})
export type PlanoCriar = z.infer<typeof PlanoCriar>

export const PlanoPatch = z
  .strictObject({
    nome: z.string().trim().min(1).max(80).optional(),
    valor_centavos: Centavos.optional(),
    inclui: Inclui.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'informe ao menos um campo para alterar' })
export type PlanoPatch = z.infer<typeof PlanoPatch>
