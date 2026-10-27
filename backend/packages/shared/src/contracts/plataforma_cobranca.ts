// Contratos de borda do modulo plataforma_cobranca (cobranca restaurante -> Whaviso).
// Fonte unica; o codegen reemite para o front quando o barrel (contracts/index.ts) passar a
// reexportar este agregado (fiacao do integrador; ver MODULE.md). Dinheiro sempre em centavos
// (inteiro). Datas de negocio (competencia, vencimento) trafegam como 'YYYY-MM-DD'; a virada de
// mes e o vencimento sao calculados no servidor em America/Sao_Paulo, nunca no cliente.
//
// Duas audiencias distintas:
//   - operador da plataforma (equipe Whaviso): ve assinaturas e faturas de qualquer conta;
//   - dono da loja (membro): ve SO as faturas da propria conta, num DTO enxuto (MinhaFaturaDTO),
//     sem nenhum dado de outra conta.
import { z } from 'zod'
import { Centavos, DataHoraIso, UuidSchema } from './primitivos'
import { statusAssinatura, statusFatura } from './enums'

export { statusAssinatura, statusFatura } from './enums'
export type { StatusAssinatura, StatusFatura } from './enums'

/** Dia de vencimento mensal. Limitado a 1..28 para existir em todo mes (inclusive fevereiro). */
export const DiaVencimento = z.number().int().min(1).max(28)

/** Mes de competencia: sempre o PRIMEIRO dia do mes de referencia ('YYYY-MM-01'). */
export const CompetenciaMes = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, 'competencia deve ser o primeiro dia do mes (YYYY-MM-01)')

/** Data de negocio 'YYYY-MM-DD' (vencimento). */
// data (YYYY-MM-DD) local do modulo; o barrel ja exporta DataIso via disponibilidade
const DataIso = z.iso.date()

// ---- Assinatura -----------------------------------------------------------------------------

export const AssinaturaDTO = z.strictObject({
  id: UuidSchema,
  conta_id: UuidSchema,
  /** NULL = assinatura da conta inteira (vale para todas as lojas da conta). */
  loja_id: UuidSchema.nullable(),
  status: statusAssinatura,
  valor_mensal_centavos: Centavos,
  dia_vencimento: DiaVencimento,
  trial_ate: DataHoraIso.nullable(),
  inicio_em: DataHoraIso.nullable(),
  cancelada_em: DataHoraIso.nullable(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type AssinaturaDTO = z.infer<typeof AssinaturaDTO>

/** Criacao: so 'trial' ou 'ativa' (suspensa/cancelada nunca nascem de uma criacao). */
export const AssinaturaCriar = z.strictObject({
  conta_id: UuidSchema,
  loja_id: UuidSchema.nullable().optional(),
  status: z.enum(['trial', 'ativa']).default('trial'),
  valor_mensal_centavos: Centavos.default(70000),
  dia_vencimento: DiaVencimento.default(10),
  /** Fim do trial (so faz sentido quando status = 'trial'). */
  trial_ate: DataHoraIso.optional(),
})
export type AssinaturaCriar = z.infer<typeof AssinaturaCriar>

/**
 * Alteracao de assinatura. `status` dispara transicao (suspender/reativar/cancelar, validada no
 * servico); valor/vencimento valem para faturas FUTURAS (fatura emitida e imutavel no valor).
 * Pelo menos um campo e obrigatorio.
 */
export const AssinaturaPatch = z
  .strictObject({
    status: statusAssinatura.optional(),
    valor_mensal_centavos: Centavos.optional(),
    dia_vencimento: DiaVencimento.optional(),
  })
  .refine((v) => v.status !== undefined || v.valor_mensal_centavos !== undefined || v.dia_vencimento !== undefined, {
    message: 'informe ao menos um campo para alterar',
  })
export type AssinaturaPatch = z.infer<typeof AssinaturaPatch>

export const AssinaturasLista = z.array(AssinaturaDTO)

// ---- Fatura ---------------------------------------------------------------------------------

export const FaturaDTO = z.strictObject({
  id: UuidSchema,
  assinatura_id: UuidSchema,
  conta_id: UuidSchema,
  competencia: DataIso,
  valor_centavos: Centavos,
  vencimento: DataIso,
  status: statusFatura,
  pago_em: DataHoraIso.nullable(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type FaturaDTO = z.infer<typeof FaturaDTO>

export const FaturasLista = z.array(FaturaDTO)

/** Baixa manual: `reativar` reativa a assinatura suspensa por atraso quando nao restam atrasos. */
export const FaturaMarcarPaga = z.strictObject({
  reativar: z.boolean().default(false),
})
export type FaturaMarcarPaga = z.infer<typeof FaturaMarcarPaga>

/** Visao do dono da loja: SO a propria fatura, sem ids/dados de outra conta. */
export const MinhaFaturaDTO = z.strictObject({
  id: UuidSchema,
  competencia: DataIso,
  valor_centavos: Centavos,
  vencimento: DataIso,
  status: statusFatura,
  pago_em: DataHoraIso.nullable(),
})
export type MinhaFaturaDTO = z.infer<typeof MinhaFaturaDTO>

export const MinhasFaturasLista = z.array(MinhaFaturaDTO)

// ---- Jobs (execucao manual pelo operador) ---------------------------------------------------

/** Entrada da geracao de faturas: competencia alvo; ausente = mes corrente (resolvido no servidor). */
export const GerarFaturasEntrada = z.strictObject({
  competencia: CompetenciaMes.optional(),
})
export type GerarFaturasEntrada = z.infer<typeof GerarFaturasEntrada>

export const GerarFaturasResultado = z.strictObject({
  competencia: DataIso,
  geradas: z.number().int().nonnegative(),
  ja_existiam: z.number().int().nonnegative(),
})
export type GerarFaturasResultado = z.infer<typeof GerarFaturasResultado>

export const ApurarAtrasosResultado = z.strictObject({
  marcadas_atrasadas: z.number().int().nonnegative(),
  assinaturas_suspensas: z.number().int().nonnegative(),
})
export type ApurarAtrasosResultado = z.infer<typeof ApurarAtrasosResultado>
