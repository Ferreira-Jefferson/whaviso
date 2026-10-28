// Contratos de borda do modulo pessoas. Fonte unica: @whaviso/shared/contracts (o codegen reemite
// para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'
import { UuidSchema } from '@whaviso/shared/contracts'

export {
  CargoCriarEntrada,
  CargoAtualizarEntrada,
  CargoSaida,
  CargoListaSaida,
  PessoaCriarEntrada,
  PessoaAtualizarEntrada,
  PessoaSaida,
  PessoaListaSaida,
  PessoaDetalheSaida,
  PessoaTelefoneSaida,
  PessoaEntregaEntrada,
  PessoaEntregaSaida,
  PessoaEntregaPixSaida,
  EscalaCriarEntrada,
  EscalaAtualizarEntrada,
  EscalaSaida,
  EscalaListaSaida,
  type CargoNovo,
  type CargoPatch,
  type CargoDto,
  type PessoaNova,
  type PessoaPatch,
  type PessoaDto,
  type PessoaEntregaNova,
  type PessoaEntregaDto,
  type EscalaNova,
  type EscalaPatch,
  type EscalaDto,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: UuidSchema })
