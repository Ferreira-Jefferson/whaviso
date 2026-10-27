// Contratos de borda do modulo clientes. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'

export {
  ClienteBuscaEntrada,
  ClienteBuscaTelefoneEntrada,
  ClienteCriarEntrada,
  ClienteAtualizarEntrada,
  ClienteListaItem,
  ClienteListaSaida,
  EnderecoCampos,
  EnderecoEntrada,
  EnderecoAtualizarEntrada,
  EnderecoSaida,
  EnderecoListaSaida,
  UltimoEnderecoSaida,
  ClienteDetalheSaida,
  ClienteSaida,
  TelefoneRevelarSaida,
  ClienteConflitoSaida,
  type ClienteBuscaTelefone,
  type ClienteBusca,
  type EnderecoNovo,
  type EnderecoPatch,
  type EnderecoDto,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
