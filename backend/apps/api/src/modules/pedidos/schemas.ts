// Contratos de borda do modulo pedidos. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui ficam apenas os parametros de rota (plumbing server-side).
import { z } from 'zod'

export {
  formaPagamento,
  PedidoItemEntrada,
  PedidoCriarManualEntrada,
  PedidoStatusEntrada,
  PedidoRepetirEntrada,
  PedidoTransicaoLoteEntrada,
  PedidoTransicaoLoteSaida,
  colunaKanban,
  KanbanQuery,
  ImpressaoQuery,
  PedidoCard,
  KanbanColuna,
  PedidoKanbanSaida,
  OpcaoPedidoSaida,
  ItemPedidoSaida,
  EnderecoPedidoSaida,
  ClientePedidoSaida,
  PedidoDetalheSaida,
  PedidoImpressaoSaida,
  type ColunaKanban,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
export const ItemParams = z.strictObject({ id: z.uuid(), itemId: z.uuid() })
