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

// --- Janela do atendente (IA): fora dela o atendente nao responde ---
export const JanelaAtendenteEntrada = z
  .strictObject({
    inicio: Hhmm,
    fim: Hhmm,
    dias: z.array(DiaSemana).min(1).max(7).refine((d) => new Set(d).size === d.length, {
      message: 'dias repetidos',
    }),
    ativo: z.boolean().optional(),
  })
  .refine((j) => j.inicio !== j.fim, { message: 'inicio e fim nao podem ser iguais' })
export type JanelaAtendenteEntrada = z.infer<typeof JanelaAtendenteEntrada>

export const JanelaAtendenteSaida = z.strictObject({
  inicio: Hhmm,
  fim: Hhmm,
  dias: z.array(DiaSemana),
  ativo: z.boolean(),
  atualizado_em: DataHoraIso,
})
export type JanelaAtendenteSaida = z.infer<typeof JanelaAtendenteSaida>
/** `janela` e null quando a loja ainda nao configurou a janela do atendente. */
export const JanelaAtendenteGetSaida = z.strictObject({ janela: JanelaAtendenteSaida.nullable() })

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
  aceitando_agora: z.boolean(),
  atendente_pode_responder: z.boolean(),
})
export type DisponibilidadeAgoraSaida = z.infer<typeof DisponibilidadeAgoraSaida>
