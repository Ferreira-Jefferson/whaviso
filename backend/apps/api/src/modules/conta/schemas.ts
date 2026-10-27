// Contratos de borda do modulo conta. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui ficam apenas os parametros de rota (plumbing server-side).
import { z } from 'zod'

export {
  ContaCriarEntrada,
  ContaAtualizarEntrada,
  ContaSaida,
  MembroSaida,
  MembrosSaida,
  MembroPapelAtualizarEntrada,
  ConviteCriarEntrada,
  ConviteSaida,
  ConvitesSaida,
  ConviteAceitarEntrada,
  ConviteAceitarSaida,
  type ContaCriarEntradaT,
  type MembroPapelAtualizarEntradaT,
  type ConviteCriarEntradaT,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
