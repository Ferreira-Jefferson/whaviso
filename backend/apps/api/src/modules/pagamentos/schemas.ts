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
