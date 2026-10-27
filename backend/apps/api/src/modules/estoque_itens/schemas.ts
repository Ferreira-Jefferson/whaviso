// Contratos de borda do modulo estoque_itens. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'

export {
  TipoMovimentoEstoque,
  TipoMovimentoRegistrado,
  EstoqueControleEntrada,
  EstoqueMovimentoEntrada,
  EstoqueBuscaEntrada,
  EstoqueItemSaida,
  EstoqueListaSaida,
  EstoqueMovimentoSaida,
  EstoqueMovimentosSaida,
  type EstoqueControle,
  type EstoqueMovimentoNovo,
  type EstoqueBusca,
  type EstoqueItemDto,
  type EstoqueMovimentoDto,
} from '@whaviso/shared/contracts'

export const ParamId = z.strictObject({ id: z.uuid() })
