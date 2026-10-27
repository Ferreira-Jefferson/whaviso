// Contratos de borda do modulo lojas (fonte unica; o codegen reemite para o front).
// Todo jsonb do banco (cores, endereco, horarios, area_entrega) passa por estes schemas (SEC-081).
import { z } from 'zod'
import { papelMembro } from './enums'
import { DataHoraIso } from './primitivos'

// --- Horarios: helpers puros (sem I/O) usados pelo refinement de sobreposicao ---
// America/Sao_Paulo e nomeado no servidor; aqui tratamos apenas minutos desde 00:00.
function paraMinutos(hhmmStr: string): number {
  const [h, m] = hhmmStr.split(':')
  return Number(h) * 60 + Number(m)
}

/** Faixa em minutos desde 00:00 do dia de abertura; fecha pode passar de 1440 (cruza meia-noite). */
function intervalo(f: { abre: string; fecha: string }): [number, number] {
  const a = paraMinutos(f.abre)
  const c = paraMinutos(f.fecha)
  return [a, c > a ? c : c + 1440]
}

/** true se faixas do mesmo dia se sobrepoem, ou se a virada de um dia invade o dia seguinte. */
function faixasSobrepostas(
  dias: readonly { dia: number; faixas: readonly { abre: string; fecha: string }[] }[],
): boolean {
  const porDia = new Map<number, [number, number][]>()
  for (const d of dias) porDia.set(d.dia, d.faixas.map(intervalo))
  for (const [dia, ivs] of porDia) {
    const ord = [...ivs].sort((x, y) => x[0] - y[0])
    for (let i = 1; i < ord.length; i++) if (ord[i]![0] < ord[i - 1]![1]) return true
    const resto = Math.max(0, ...ivs.map(([, f]) => f - 1440))
    if (resto > 0) {
      const prox = porDia.get((dia + 1) % 7) ?? []
      if (prox.some(([a]) => a < resto)) return true
    }
  }
  return false
}

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor deve ser #RRGGBB')
export const Cores = z.strictObject({
  primaria: Hex.optional(),
  secundaria: Hex.optional(),
  fundo: Hex.optional(),
  texto: Hex.optional(),
  destaque: Hex.optional(),
})
export type Cores = z.infer<typeof Cores>

const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'horario deve ser HH:mm')
export const FaixaHorario = z
  .strictObject({ abre: Hhmm, fecha: Hhmm })
  .refine((f) => f.abre !== f.fecha, { message: 'abre e fecha nao podem ser iguais' })
export type FaixaHorario = z.infer<typeof FaixaHorario>

// fecha < abre = faixa cruza a meia-noite (18:00 a 02:00 vale ate 02:00 do dia seguinte).
export const DiaHorario = z
  .strictObject({
    dia: z.number().int().min(0).max(6), // 0 = domingo
    fechado: z.boolean(),
    faixas: z.array(FaixaHorario).max(6),
  })
  .refine((d) => !d.fechado || d.faixas.length === 0, { message: 'dia fechado nao tem faixas' })
export type DiaHorario = z.infer<typeof DiaHorario>

export const Horarios = z
  .strictObject({
    fuso: z.literal('America/Sao_Paulo'),
    dias: z.array(DiaHorario).length(7),
  })
  .refine((h) => h.dias.every((d, i) => d.dia === i), {
    message: 'dias devem vir de 0 a 6 em ordem',
  })
  .refine((h) => !faixasSobrepostas(h.dias), { message: 'faixas de horario se sobrepoem' })
export type Horarios = z.infer<typeof Horarios>

export const Endereco = z.strictObject({
  logradouro: z.string().trim().min(1).max(200),
  numero: z.string().trim().min(1).max(20),
  complemento: z.string().trim().max(100).optional(),
  bairro: z.string().trim().min(1).max(100),
  cidade: z.string().trim().min(1).max(100),
  uf: z.string().regex(/^[A-Z]{2}$/),
  cep: z.string().regex(/^\d{8}$/),
})
export type Endereco = z.infer<typeof Endereco>

const Centro = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export const RAIO_KM_MAX = 50
export const AreaEntrega = z.discriminatedUnion('modo', [
  z.strictObject({
    modo: z.literal('raio'),
    raio_km: z.number().positive().max(RAIO_KM_MAX),
    centro: Centro,
  }),
  z.strictObject({
    modo: z.literal('bairros'),
    bairros: z
      .array(z.string().trim().min(1).max(100))
      .max(300)
      .refine((l) => new Set(l.map((b) => b.toLowerCase())).size === l.length, {
        message: 'bairros repetidos',
      }),
  }),
])
export type AreaEntrega = z.infer<typeof AreaEntrega>

const NomeLoja = z.string().trim().min(2).max(100)
// Esquema https e tamanho aqui; host allowlisted e checado no service.
export const LogoUrl = z.url({ protocol: /^https$/ }).max(500)

export const LojaCriarEntrada = z.strictObject({
  nome: NomeLoja,
  endereco: Endereco.optional(),
  horarios: Horarios.optional(),
  area_entrega: AreaEntrega.optional(),
})
export type LojaCriarEntrada = z.infer<typeof LojaCriarEntrada>

export const LojaAtualizarEntrada = z
  .strictObject({
    nome: NomeLoja.optional(),
    endereco: Endereco.nullable().optional(),
    horarios: Horarios.nullable().optional(),
    area_entrega: AreaEntrega.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type LojaAtualizarEntrada = z.infer<typeof LojaAtualizarEntrada>

export const LojaBrandingEntrada = z
  .strictObject({ cores: Cores.optional(), logo_url: LogoUrl.nullable().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type LojaBrandingEntrada = z.infer<typeof LojaBrandingEntrada>

/** Resumo de numeros WhatsApp da loja (so contagem; nunca token, hash ou telefone). */
export const NumerosResumo = z.strictObject({
  total: z.number().int().nonnegative(),
  conectados: z.number().int().nonnegative(),
})

/** Forma unica de saida, na lista e no detalhe. Sem conta_id (interno). */
export const LojaSaida = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  logo_url: z.string().nullable(),
  cores: Cores,
  endereco: Endereco.nullable(),
  horarios: Horarios.nullable(),
  area_entrega: AreaEntrega.nullable(),
  ativo: z.boolean(),
  papel: papelMembro, // papel do usuario nesta loja (dono, ao ver loja inativa da propria conta)
  aberta_agora: z.boolean().nullable(), // null sem horarios; calculado no servidor
  numeros_whatsapp: NumerosResumo,
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type LojaSaida = z.infer<typeof LojaSaida>

export const LojaListaSaida = z.strictObject({ itens: z.array(LojaSaida) })
export const LojaListaQuery = z.strictObject({
  incluir_inativas: z.enum(['true', 'false']).default('false'),
})
