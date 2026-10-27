// Contratos de borda do modulo estoque_insumos (materia-prima do restaurante). Fonte unica;
// o codegen reemite para o front. Schemas Zod estritos (SEC-081). Quantidades em numeric(14,3)
// (kg/g/l/ml/un), dinheiro em centavos (integer). Nomes prefixados por Insumo para nao colidir
// no barrel de @whaviso/shared/contracts com movimentos de caixa / estoque de item.
import { z } from 'zod'
import { UuidSchema } from './primitivos'

const Uuid = UuidSchema
// Data serializada do banco como string nao vazia (nao forca ISO estrito aqui).
const DataHora = z.string().min(1)
const texto = (max: number) => z.string().trim().min(1).max(max)

/** Unidades aceitas no cadastro (texto fechado; o catalogo do app usa estas). */
export const UNIDADES_INSUMO = ['kg', 'g', 'l', 'ml', 'un', 'cx', 'pct', 'dz'] as const
export const UnidadeInsumo = z.enum(UNIDADES_INSUMO)

/** Quantidade nao negativa, ate 3 casas decimais (arredondada pelo numeric(14,3) do banco). */
const Quantidade = z.number().nonnegative().max(99_999_999_999)
const Centavos = z.number().int().min(0).max(2_000_000_000)

// --- Entradas (cadastro) ---------------------------------------------------------------------

export const InsumoCriarEntrada = z.strictObject({
  nome: texto(120),
  unidade: UnidadeInsumo,
  quantidade_minima: Quantidade.default(0),
  /** Saldo inicial; se > 0 registra um movimento 'entrada' na criacao. */
  quantidade_inicial: Quantidade.default(0),
  custo_unitario_centavos: Centavos.nullable().optional(),
})

/** PATCH parcial do cadastro: NUNCA mexe em quantidade_atual (isso e via movimento). */
export const InsumoAtualizarEntrada = z
  .strictObject({
    nome: texto(120).optional(),
    unidade: UnidadeInsumo.optional(),
    quantidade_minima: Quantidade.optional(),
    custo_unitario_centavos: Centavos.nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })

/** Tipos de movimento que o PAINEL lanca. 'consumo' e reservado ao fluxo da ficha tecnica. */
export const TIPOS_MOVIMENTO_INSUMO_PAINEL = ['entrada', 'saida', 'ajuste'] as const
export const TipoMovimentoInsumoPainel = z.enum(TIPOS_MOVIMENTO_INSUMO_PAINEL)

// 'entrada': saldo += quantidade. 'saida': saldo -= quantidade (nunca < 0).
// 'ajuste': saldo = quantidade (recontagem para um valor absoluto).
export const MovimentoInsumoEntrada = z.strictObject({
  insumo_id: Uuid,
  tipo: TipoMovimentoInsumoPainel,
  quantidade: Quantidade,
  motivo: texto(200).optional(),
})

export const MovimentosInsumoBuscaEntrada = z.strictObject({
  limite: z.coerce.number().int().min(1).max(200).default(50),
})

// --- Saidas ----------------------------------------------------------------------------------

export const InsumoSaida = z.strictObject({
  id: Uuid,
  nome: z.string(),
  unidade: z.string(),
  quantidade_atual: z.number(),
  quantidade_minima: z.number(),
  custo_unitario_centavos: z.number().int().nullable(),
  ativo: z.boolean(),
  abaixo_minimo: z.boolean(),
  criado_em: DataHora,
  atualizado_em: DataHora,
})
export const InsumoListaSaida = z.strictObject({ itens: z.array(InsumoSaida) })
export const InsumoBaixoEstoqueSaida = z.strictObject({ itens: z.array(InsumoSaida) })

export const TODOS_TIPOS_MOVIMENTO_INSUMO = ['entrada', 'saida', 'ajuste', 'consumo'] as const
export const TipoMovimentoInsumo = z.enum(TODOS_TIPOS_MOVIMENTO_INSUMO)

export const MovimentoInsumoSaida = z.strictObject({
  id: Uuid,
  insumo_id: Uuid,
  tipo: TipoMovimentoInsumo,
  quantidade: z.number(),
  quantidade_resultante: z.number(),
  motivo: z.string().nullable(),
  pedido_id: Uuid.nullable(),
  criado_por_user_id: Uuid.nullable(),
  criado_em: DataHora,
})
export const MovimentoInsumoListaSaida = z.strictObject({ itens: z.array(MovimentoInsumoSaida) })

/** Resposta do POST /movimentos: o insumo ja com o novo saldo + o movimento registrado. */
export const MovimentoInsumoAplicadoSaida = z.strictObject({
  insumo: InsumoSaida,
  movimento: MovimentoInsumoSaida,
})

export type InsumoNovo = z.infer<typeof InsumoCriarEntrada>
export type InsumoPatch = z.infer<typeof InsumoAtualizarEntrada>
export type MovimentoInsumoNovo = z.infer<typeof MovimentoInsumoEntrada>
export type InsumoDto = z.infer<typeof InsumoSaida>
export type MovimentoInsumoDto = z.infer<typeof MovimentoInsumoSaida>
