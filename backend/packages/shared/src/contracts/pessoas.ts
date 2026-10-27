// Contratos de borda do modulo pessoas (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos (SEC-081). Cadastro de PESSOAS que trabalham a favor da loja (nao
// necessariamente funcionarios CLT: motoboy, churrasqueiro de fim de semana, etc.) + cargos
// (funcoes) editaveis + escala de trabalho. SEM folha de pagamento, SEM fiscal. O telefone da
// pessoa e PII: so existe em claro na ENTRADA (cadastro/edicao) e em PessoaTelefoneSaida (revelar,
// dono/gerente).
import { z } from 'zod'
import { UuidSchema } from './primitivos'

const Uuid = UuidSchema
// Saida de data como string nao vazia (serializacao do banco; nao forca ISO estrito aqui).
const DataHora = z.string().min(1)
const texto = (max: number) => z.string().trim().min(1).max(max)

// Hora local no formato HH:MM (24h). A escala e sempre hora de parede da loja (America/Sao_Paulo).
const Hora = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora deve estar em HH:MM (24h)')

// ---------------------------------------------------------------------------------------------
// Cargos (funcoes). Presets de plataforma tem loja_id = null (visiveis a todas as lojas) e podem
// ter uma chave estavel (ex.: 'motoboy'). O cargo 'motoboy' (sistema=true) e fixo: nao pode ser
// apagado, desativado nem ter a chave editada. A loja cria cargos proprios (loja_id = sua loja) e
// edita/arquiva apenas os seus (nao-sistema).
// ---------------------------------------------------------------------------------------------
export const CargoCriarEntrada = z.strictObject({
  nome: texto(60),
})

export const CargoAtualizarEntrada = z
  .strictObject({
    nome: texto(60).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })

export const CargoSaida = z.strictObject({
  id: Uuid,
  loja_id: Uuid.nullable(),
  chave: z.string().nullable(),
  nome: z.string(),
  sistema: z.boolean(),
  ativo: z.boolean(),
  criado_em: DataHora,
  atualizado_em: DataHora,
})
export const CargoListaSaida = z.strictObject({ itens: z.array(CargoSaida) })

// ---------------------------------------------------------------------------------------------
// Pessoas. Uma pessoa com cargo cuja chave='motoboy' E o motoboy usado na entrega.
// ---------------------------------------------------------------------------------------------
export const PessoaCriarEntrada = z.strictObject({
  nome: texto(120),
  cargo_id: Uuid,
  // Telefone: so string nao-vazia aqui; a validacao/normalizacao BR fica no service
  // (normalizarTelefoneBR do @whaviso/shared/cifra), que devolve 422 'telefone_invalido'
  // (regra de negocio), igual ao modulo clientes. Formato invalido nao e erro de shape (400).
  telefone: z.string().trim().min(1).max(30).optional(),
  observacoes: texto(500).optional(),
})

/** PATCH parcial: telefone/observacoes podem ser limpos com null; nome/cargo nao. */
export const PessoaAtualizarEntrada = z
  .strictObject({
    nome: texto(120).optional(),
    cargo_id: Uuid.optional(),
    telefone: z.string().trim().min(1).max(30).nullable().optional(),
    observacoes: texto(500).nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })

export const PessoaSaida = z.strictObject({
  id: Uuid,
  nome: z.string(),
  cargo_id: Uuid,
  cargo_nome: z.string(),
  cargo_chave: z.string().nullable(),
  telefone_mascarado: z.string().nullable(),
  observacoes: z.string().nullable(),
  ativo: z.boolean(),
  criado_em: DataHora,
  atualizado_em: DataHora,
})
export const PessoaListaSaida = z.strictObject({ itens: z.array(PessoaSaida) })

export const PessoaTelefoneSaida = z.strictObject({ telefone: z.string() })

// ---------------------------------------------------------------------------------------------
// Escalas (dias e horarios que a pessoa trabalha; varias linhas por pessoa).
// ---------------------------------------------------------------------------------------------
export const EscalaCriarEntrada = z
  .strictObject({
    dia_semana: z.number().int().min(0).max(6),
    entrada: Hora,
    saida: Hora,
  })
  .refine((o) => o.entrada !== o.saida, { message: 'entrada e saida nao podem ser iguais' })

export const EscalaAtualizarEntrada = z
  .strictObject({
    dia_semana: z.number().int().min(0).max(6).optional(),
    entrada: Hora.optional(),
    saida: Hora.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })

export const EscalaSaida = z.strictObject({
  id: Uuid,
  pessoa_id: Uuid,
  dia_semana: z.number().int().min(0).max(6),
  entrada: z.string(),
  saida: z.string(),
  ativo: z.boolean(),
  criado_em: DataHora,
})
export const EscalaListaSaida = z.strictObject({ itens: z.array(EscalaSaida) })

export const PessoaDetalheSaida = PessoaSaida.extend({
  escalas: z.array(EscalaSaida),
})

export type CargoNovo = z.infer<typeof CargoCriarEntrada>
export type CargoPatch = z.infer<typeof CargoAtualizarEntrada>
export type PessoaNova = z.infer<typeof PessoaCriarEntrada>
export type PessoaPatch = z.infer<typeof PessoaAtualizarEntrada>
export type EscalaNova = z.infer<typeof EscalaCriarEntrada>
export type EscalaPatch = z.infer<typeof EscalaAtualizarEntrada>
export type EscalaDto = z.infer<typeof EscalaSaida>
export type CargoDto = z.infer<typeof CargoSaida>
export type PessoaDto = z.infer<typeof PessoaSaida>
