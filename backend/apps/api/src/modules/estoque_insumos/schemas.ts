// Contratos de borda do modulo estoque_insumos. Fonte unica: @whaviso/shared/contracts
// (o codegen reemite para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'

export {
  InsumoCriarEntrada,
  InsumoAtualizarEntrada,
  MovimentoInsumoEntrada,
  MovimentosInsumoBuscaEntrada,
  InsumoSaida,
  InsumoListaSaida,
  InsumoBaixoEstoqueSaida,
  MovimentoInsumoSaida,
  MovimentoInsumoListaSaida,
  MovimentoInsumoAplicadoSaida,
  UnidadeInsumo,
  TipoMovimentoInsumo,
  TipoMovimentoInsumoPainel,
  type InsumoNovo,
  type InsumoPatch,
  type MovimentoInsumoNovo,
  type InsumoDto,
  type MovimentoInsumoDto,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
