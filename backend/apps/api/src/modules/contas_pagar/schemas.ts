// Contratos de borda do modulo contas a pagar. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'
import { UuidSchema } from '@whaviso/shared/contracts'

export {
  FornecedorEntrada,
  FornecedorAtualizarEntrada,
  FornecedorListaQuery,
  FornecedorSaida,
  FornecedorListaSaida,
  FornecedorTelefoneSaida,
  ContaPagarEntrada,
  ContaPagarAtualizarEntrada,
  ContaPagarListaQuery,
  ContaPagarSaida,
  ContaPagarListaSaida,
  PagarContaEntrada,
  type FornecedorNovo,
  type FornecedorPatch,
  type FornecedorDto,
  type ContaPagarNovo,
  type ContaPagarPatch,
  type ContaPagarDto,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: UuidSchema })
