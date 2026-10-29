// Contratos de borda do módulo pagamentos. Fonte única dos DTOs: @whaviso/shared/contracts
// (o codegen reemite para o front). Aqui ficam só os parâmetros/consulta de rota.
import { z } from 'zod'

export {
  LojaPixEntrada,
  LojaPixEstado,
  LojaPixEstadoResposta,
  CriarCobrancaEntrada,
  ConciliarEntrada,
  PagamentosFiltro,
  PagamentoSaida,
  ListaPagamentosSaida,
  type LojaPixEntrada as LojaPixEntradaTipo,
  type LojaPixEstado as LojaPixEstadoTipo,
  type CriarCobrancaEntrada as CriarCobrancaEntradaTipo,
  type ConciliarEntrada as ConciliarEntradaTipo,
  type PagamentosFiltro as PagamentosFiltroTipo,
  type PagamentoSaida as PagamentoSaidaTipo,
} from '@whaviso/shared/contracts'

/** Parâmetro de rota :id (id da cobrança). */
export const pagamentoIdParam = z.strictObject({ id: z.uuid() })

/** Parâmetro de rota :pedidoId (criar cobrança a partir do pedido). */
export const pedidoIdParam = z.strictObject({ pedidoId: z.uuid() })

// ---- Config de pagamento da loja (modo do Pix + quem paga a taxa de intermediacao) -------------

export const pixModo = z.enum(['chave_propria', 'intermediado'])
export type PixModo = z.infer<typeof pixModo>

export const encargoModo = z.enum(['absorve', 'repassa'])
export type EncargoModo = z.infer<typeof encargoModo>

export const PagamentoConfigDTO = z.strictObject({
  pix_modo: pixModo,
  encargo_modo: encargoModo,
  cartao_habilitado: z.boolean(),
  /** null enquanto a loja ainda nao salvou config (valores sao o default). */
  atualizado_em: z.string().nullable(),
})
export type PagamentoConfigDTO = z.infer<typeof PagamentoConfigDTO>

export const PagamentoConfigPatch = z
  .strictObject({
    pix_modo: pixModo.optional(),
    encargo_modo: encargoModo.optional(),
    cartao_habilitado: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'informe ao menos um campo para alterar' })
export type PagamentoConfigPatch = z.infer<typeof PagamentoConfigPatch>
