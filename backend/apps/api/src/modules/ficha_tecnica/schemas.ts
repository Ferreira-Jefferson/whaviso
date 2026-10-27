// Contratos de borda do modulo ficha_tecnica. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :itemId.
import { z } from 'zod'
import { UuidSchema } from '@whaviso/shared/contracts'

export {
  FichaQuantidade,
  FichaLinhaEntrada,
  FichaTecnicaEntrada,
  FichaLinhaSaida,
  FichaTecnicaSaida,
} from '@whaviso/shared/contracts'

export const ItemIdParams = z.strictObject({ itemId: UuidSchema })
