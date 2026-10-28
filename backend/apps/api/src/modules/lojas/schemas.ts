// Contratos de borda do modulo lojas. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota (plumbing server-side).
import { z } from 'zod'

export {
  Cores,
  Endereco,
  LogoUrl,
  LojaCriarEntrada,
  LojaAtualizarEntrada,
  LojaBrandingEntrada,
  LojaPausarEntrada,
  LojaCapacidadeEntrada,
  NumerosResumo,
  LojaSaida,
  LojaListaSaida,
  LojaListaQuery,
} from '@whaviso/shared/contracts'

export const LojaParams = z.strictObject({ id: z.uuid() })
