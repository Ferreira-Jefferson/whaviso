// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/disponibilidade.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo disponibilidade (fonte unica; o codegen reemite para o front).
// America/Sao_Paulo e nomeado no servidor; aqui so tratamos "HH:mm" e datas "YYYY-MM-DD".
import { z } from 'zod'
import { DataHoraIso } from './primitivos'

/** Horario do dia "HH:mm" (00:00 a 23:59). */
export const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'horario deve ser HH:mm')
/** Dia da semana: 0 = domingo ... 6 = sabado. */
export const DiaSemana = z.number().int().min(0).max(6)
/** Data de negocio "YYYY-MM-DD" (sem fuso; interpretada em America/Sao_Paulo no servidor). */
export const DataIso = z.iso.date()
const Motivo = z.string().trim().min(1).max(200)

// --- Horarios de funcionamento (varias faixas por dia) ---
export const HorarioEntrada = z
  .strictObject({ dia_semana: DiaSemana, abre: Hhmm, fecha: Hhmm, ativo: z.boolean().optional() })
  .refine((h) => h.abre !== h.fecha, { message: 'abre e fecha nao podem ser iguais' })
export type HorarioEntrada = z.infer<typeof HorarioEntrada>

export const HorarioPatch = z
  .strictObject({ abre: Hhmm.optional(), fecha: Hhmm.optional(), ativo: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type HorarioPatch = z.infer<typeof HorarioPatch>

export const HorarioSaida = z.strictObject({
  id: z.uuid(),
  dia_semana: DiaSemana,
  abre: Hhmm,
  fecha: Hhmm,
  ativo: z.boolean(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type HorarioSaida = z.infer<typeof HorarioSaida>
export const HorarioListaSaida = z.strictObject({ itens: z.array(HorarioSaida) })

// --- Janela de agendamento da loja (fonte unica; o atendente nao tem horario proprio) ---
/** Modo da janela de agendamento: desligado (so pedido ao vivo), faixa propria, ou 24h. */
export const ModoAgendamento = z.enum(['desligado', 'faixa', '24h'])
/** Modo derivado do atendente, computado no servidor a partir da disponibilidade da loja. */
export const ModoAtendente = z.enum(['atendimento', 'agendamento', 'fechado'])

export const AgendamentoEntrada = z
  .strictObject({
    modo: ModoAgendamento,
    inicio: Hhmm.nullable().optional(),
    fim: Hhmm.nullable().optional(),
    dias: z.array(DiaSemana).max(7).optional(),
  })
  .refine(
    (a) => a.modo !== 'faixa' || (!!a.inicio && !!a.fim && a.inicio !== a.fim && !!a.dias && a.dias.length >= 1),
    { message: 'modo faixa exige inicio, fim distintos e ao menos um dia' },
  )
export type AgendamentoEntrada = z.infer<typeof AgendamentoEntrada>

// Nome `AgendamentoConfigSaida` (nao `AgendamentoSaida`) para nao colidir com o contrato
// `agendamento.ts` (pedido agendado), que ja exporta `AgendamentoSaida` no mesmo barrel.
export const AgendamentoConfigSaida = z.strictObject({
  modo: ModoAgendamento,
  inicio: Hhmm.nullable(),
  fim: Hhmm.nullable(),
  dias: z.array(DiaSemana), // [] quando nao e faixa
  atualizado_em: DataHoraIso,
})
export type AgendamentoConfigSaida = z.infer<typeof AgendamentoConfigSaida>
/** Default desligado quando a loja ainda nao configurou agendamento (nunca ha null). */
export const AgendamentoGetSaida = z.strictObject({ agendamento: AgendamentoConfigSaida })

// --- Excecoes / feriados ---
export const ExcecaoEntrada = z
  .strictObject({
    data: DataIso,
    fechado: z.boolean().default(true),
    abre: Hhmm.nullable().optional(),
    fecha: Hhmm.nullable().optional(),
    motivo: Motivo.optional(),
  })
  .refine((e) => e.fechado || (!!e.abre && !!e.fecha && e.abre !== e.fecha), {
    message: 'excecao aberta exige abre e fecha distintos',
  })
export type ExcecaoEntrada = z.infer<typeof ExcecaoEntrada>

export const ExcecaoSaida = z.strictObject({
  id: z.uuid(),
  data: DataIso,
  fechado: z.boolean(),
  abre: Hhmm.nullable(),
  fecha: Hhmm.nullable(),
  motivo: Motivo.nullable(),
  ativo: z.boolean(),
  criado_em: DataHoraIso,
})
export type ExcecaoSaida = z.infer<typeof ExcecaoSaida>
export const ExcecaoListaSaida = z.strictObject({ itens: z.array(ExcecaoSaida) })

// --- Estado derivado (calculado no servidor; nunca persistido) ---
export const DisponibilidadeAgoraSaida = z.strictObject({
  agora: DataHoraIso,
  aceitando_agora: z.boolean(), // pedido ao vivo
  modo_atendente: ModoAtendente, // atendimento|agendamento|fechado (substitui atendente_pode_responder)
})
export type DisponibilidadeAgoraSaida = z.infer<typeof DisponibilidadeAgoraSaida>
