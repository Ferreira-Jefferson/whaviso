// Contratos de borda do modulo crm (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos. Dinheiro em centavos; datas em ISO UTC. Nenhum telefone trafega aqui
// (PII): a ficha do cliente continua no modulo clientes.
import { z } from 'zod'
import { Centavos, Cursor, UuidSchema } from './primitivos'

const Uuid = UuidSchema
const DataHora = z.string().min(1)

/** Segmentos RFM (derivados na view clientes_metricas; ver migration 0034). */
export const crmSegmentos = [
  'campeao', 'fiel', 'em_risco', 'novo', 'ocasional', 'perdido', 'sem_pedido',
] as const
export const CrmSegmento = z.enum(crmSegmentos)
export type CrmSegmento = z.infer<typeof CrmSegmento>

const Nota = z.number().int().min(1).max(5)

export const RfmMetricas = z.strictObject({
  pedidos_total: z.number().int().nonnegative(),
  gasto_total_centavos: Centavos,
  ticket_medio_centavos: Centavos,
  primeiro_pedido_em: DataHora.nullable(),
  ultimo_pedido_em: DataHora.nullable(),
  recencia_dias: z.number().int().nonnegative().nullable(),
  pedidos_180d: z.number().int().nonnegative(),
  gasto_180d_centavos: Centavos,
  nota_r: Nota.nullable(),
  nota_f: Nota.nullable(),
  nota_m: Nota.nullable(),
  segmento: CrmSegmento,
})

// ---------------------------------------------------------------- lista

export const CrmClientesEntrada = z.strictObject({
  segmento: CrmSegmento.optional(),
  /** true: so quem pode receber campanha (sem opt-out). */
  contactavel: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  cursor: Cursor.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})
export type CrmClientesBusca = z.infer<typeof CrmClientesEntrada>

export const CrmClienteItem = RfmMetricas.extend({
  cliente_id: Uuid,
  nome: z.string().nullable(),
  opt_out_marketing: z.boolean(),
})
export const CrmClientesSaida = z.strictObject({
  itens: z.array(CrmClienteItem),
  proximoCursor: z.string().nullable(),
})

// ---------------------------------------------------------------- resumo

export const CrmResumoSegmento = z.strictObject({
  segmento: CrmSegmento,
  clientes: z.number().int().nonnegative(),
  gasto_180d_centavos: Centavos,
})
export const CrmResumoSaida = z.strictObject({
  clientes_total: z.number().int().nonnegative(),
  opt_out_total: z.number().int().nonnegative(),
  segmentos: z.array(CrmResumoSegmento),
})

// ---------------------------------------------------------------- o que compram

export const CrmItensEntrada = z.strictObject({
  dias: z.coerce.number().int().min(1).max(365).default(90),
  limite: z.coerce.number().int().min(1).max(50).default(10),
})
export const CrmItemVendido = z.strictObject({
  item_id: Uuid.nullable(),
  nome: z.string(),
  quantidade: z.number().int().nonnegative(),
  clientes: z.number().int().nonnegative(),
  faturamento_centavos: Centavos,
})
export const CrmItensSaida = z.strictObject({
  dias: z.number().int(),
  itens: z.array(CrmItemVendido),
})

// ---------------------------------------------------------------- ficha (historico)

export const CrmConsentimento = z.strictObject({
  opt_out_marketing: z.boolean(),
  opt_out_em: DataHora.nullable(),
  opt_in_em: DataHora.nullable(),
  origem: z.enum(['painel', 'cliente_whatsapp', 'importacao']).nullable(),
  motivo: z.string().nullable(),
})

export const CrmPedidoHistorico = z.strictObject({
  id: Uuid,
  codigo: z.string(),
  status: z.string(),
  modalidade: z.string(),
  total_centavos: Centavos,
  criado_em: DataHora,
})

export const CrmClienteDetalheSaida = z.strictObject({
  cliente_id: Uuid,
  nome: z.string().nullable(),
  metricas: RfmMetricas,
  consentimento: CrmConsentimento,
  itens_favoritos: z.array(CrmItemVendido.pick({ item_id: true, nome: true, quantidade: true })),
  ultimos_pedidos: z.array(CrmPedidoHistorico),
})

// ---------------------------------------------------------------- consentimento

export const CrmConsentimentoEntrada = z.strictObject({
  opt_out_marketing: z.boolean(),
  motivo: z.string().trim().min(1).max(200).optional(),
  origem: z.enum(['painel', 'cliente_whatsapp']).default('painel'),
})
export type CrmConsentimentoNovo = z.infer<typeof CrmConsentimentoEntrada>
