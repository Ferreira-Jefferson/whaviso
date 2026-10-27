// Contratos de borda do modulo numeros_whatsapp. Fonte unica: @whaviso/shared/contracts
// (o codegen reemite para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'

export {
  numeroConectarEntrada,
  numeroReconectarEntrada,
  numeroStatusEntrada,
  numeroSaida,
  listaNumerosSaida,
  type NumeroConectarEntrada,
  type NumeroReconectarEntrada,
  type NumeroStatusEntrada,
  type NumeroSaida,
  type ListaNumerosSaida,
} from '@whaviso/shared/contracts'

/** Parametro de rota :id. */
export const numeroIdParam = z.strictObject({ id: z.uuid() })
