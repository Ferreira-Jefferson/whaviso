// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/promocoes.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo promocoes (fonte unica; o codegen reemite para o front).
// Cupons (percentual/fixo) e combos: camada de preco promocional aplicada ao SUBTOTAL do pedido
// (a taxa de entrega nunca entra no desconto). Dinheiro em centavos; datas ISO com offset
// (a regra de negocio e America/Sao_Paulo, o cliente envia e le com offset). Schemas estritos.
import { z } from 'zod'
import { Centavos, UuidSchema } from './primitivos'

const Uuid = UuidSchema
const DataHora = z.string().min(1)
const DataHoraEntrada = z.iso.datetime({ offset: true })

export const promocaoTipos = ['cupom_percentual', 'cupom_fixo', 'combo'] as const
export const PromocaoTipo = z.enum(promocaoTipos)
export type PromocaoTipo = z.infer<typeof PromocaoTipo>

/** Codigo digitado pelo cliente: normalizado para maiusculas (comparacao sem caixa). */
export const PromocaoCodigo = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{3,30}$/, 'codigo: 3 a 30 letras, numeros, _ ou -')
  .transform((v) => v.toUpperCase())

export const PromocaoComboItem = z.strictObject({
  item_id: Uuid,
  quantidade: z.number().int().min(1).max(99).default(1),
})

const Limites = {
  limite_total: z.number().int().min(1).max(1_000_000).nullable().optional(),
  limite_por_cliente: z.number().int().min(1).max(1000).nullable().optional(),
  min_pedido_centavos: Centavos.default(0),
  desconto_maximo_centavos: Centavos.min(1).nullable().optional(),
}

/**
 * Criacao. `valor`: percentual 1..100 (cupom_percentual), centavos (cupom_fixo) ou preco final
 * do combo em centavos (combo). Cupom exige codigo; combo exige `itens`.
 */
export const PromocaoCriarEntrada = z
  .strictObject({
    nome: z.string().trim().min(1).max(120),
    tipo: PromocaoTipo,
    codigo: PromocaoCodigo.optional(),
    valor: z.number().int().min(0).max(1_000_000_000),
    inicio_em: DataHoraEntrada.nullable().optional(),
    fim_em: DataHoraEntrada.nullable().optional(),
    ...Limites,
    itens: z.array(PromocaoComboItem).max(20).optional(),
    ativo: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const erro = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (v.tipo === 'cupom_percentual' && (v.valor < 1 || v.valor > 100)) erro('valor', 'percentual de 1 a 100')
    if (v.tipo === 'cupom_fixo' && v.valor < 1) erro('valor', 'desconto fixo deve ser maior que zero')
    if (v.tipo !== 'combo' && !v.codigo) erro('codigo', 'cupom exige codigo')
    if (v.tipo !== 'combo' && v.itens?.length) erro('itens', 'itens so existem em combo')
    if (v.tipo === 'combo' && !v.itens?.length) erro('itens', 'combo exige ao menos um item')
    if (v.tipo === 'combo' && v.itens && new Set(v.itens.map((i) => i.item_id)).size !== v.itens.length) {
      erro('itens', 'item repetido no combo')
    }
    if (v.inicio_em && v.fim_em && Date.parse(v.fim_em) <= Date.parse(v.inicio_em)) {
      erro('fim_em', 'fim deve ser depois do inicio')
    }
  })
export type PromocaoCriar = z.infer<typeof PromocaoCriarEntrada>

/** Edicao parcial: tipo, codigo e itens sao imutaveis (para outro combo, crie nova promocao). */
export const PromocaoAtualizarEntrada = z
  .strictObject({
    nome: z.string().trim().min(1).max(120),
    valor: z.number().int().min(0).max(1_000_000_000),
    inicio_em: DataHoraEntrada.nullable(),
    fim_em: DataHoraEntrada.nullable(),
    limite_total: z.number().int().min(1).max(1_000_000).nullable(),
    limite_por_cliente: z.number().int().min(1).max(1000).nullable(),
    min_pedido_centavos: Centavos,
    desconto_maximo_centavos: Centavos.min(1).nullable(),
    ativo: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
export type PromocaoAtualizar = z.infer<typeof PromocaoAtualizarEntrada>

export const PromocaoListaEntrada = z.strictObject({
  ativo: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  tipo: PromocaoTipo.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})

export const PromocaoSaida = z.strictObject({
  id: Uuid,
  nome: z.string(),
  tipo: PromocaoTipo,
  codigo: z.string().nullable(),
  valor: z.number().int(),
  inicio_em: DataHora.nullable(),
  fim_em: DataHora.nullable(),
  limite_total: z.number().int().nullable(),
  limite_por_cliente: z.number().int().nullable(),
  min_pedido_centavos: z.number().int(),
  desconto_maximo_centavos: z.number().int().nullable(),
  ativo: z.boolean(),
  itens: z.array(PromocaoComboItem),
  usos_total: z.number().int(),
  criado_em: DataHora,
})
export type PromocaoDto = z.infer<typeof PromocaoSaida>

export const PromocaoListaSaida = z.strictObject({
  itens: z.array(PromocaoSaida),
  proximoCursor: z.string().nullable(),
})

/** Linha do pedido em montagem (preco unitario ja resolvido pelo cardapio). */
export const PromocaoLinhaEntrada = z.strictObject({
  item_id: Uuid,
  quantidade: z.number().int().min(1).max(999),
  preco_unitario_centavos: Centavos,
})

export const PromocaoValidarEntrada = z.strictObject({
  codigo: PromocaoCodigo,
  subtotal_centavos: Centavos,
  cliente_id: Uuid.optional(),
  linhas: z.array(PromocaoLinhaEntrada).max(100).optional(),
})
export type PromocaoValidar = z.infer<typeof PromocaoValidarEntrada>

/** Motivos de recusa (viram `error.code` 422 em /aplicar e `motivo` em /validar). */
export const promocaoMotivos = [
  'cupom_inexistente', 'cupom_inativo', 'cupom_nao_iniciado', 'cupom_expirado', 'cupom_esgotado',
  'cupom_cliente_esgotado', 'pedido_abaixo_minimo', 'combo_incompleto',
] as const
export const PromocaoMotivo = z.enum(promocaoMotivos)
export type PromocaoMotivo = z.infer<typeof PromocaoMotivo>

export const PromocaoValidarSaida = z.strictObject({
  valido: z.boolean(),
  motivo: PromocaoMotivo.nullable(),
  promocao_id: Uuid.nullable(),
  desconto_centavos: z.number().int(),
  subtotal_centavos: z.number().int(),
  /** subtotal - desconto (sem taxa de entrega). */
  total_centavos: z.number().int(),
})

/** Registro do uso ao confirmar o pedido (idempotente por promocao + pedido). */
export const PromocaoUsoEntrada = z.strictObject({
  promocao_id: Uuid,
  pedido_id: Uuid,
  cliente_id: Uuid.optional(),
  desconto_centavos: Centavos,
})
export const PromocaoUsoSaida = z.strictObject({
  id: Uuid,
  promocao_id: Uuid,
  pedido_id: Uuid,
  desconto_centavos: z.number().int(),
  criado: z.boolean(),
})
