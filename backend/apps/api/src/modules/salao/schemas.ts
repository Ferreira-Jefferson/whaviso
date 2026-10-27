// Contratos de borda do modulo salao. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id (plumbing server-side).
import { z } from 'zod'

export {
  MesaCriarEntrada,
  MesaAtualizarEntrada,
  MesaSaida,
  MesaListaSaida,
  ComandaAbrirEntrada,
  ComandaItemEntrada,
  ComandaItemSaida,
  ComandaSaida,
  ComandaListaSaida,
  comandaStatus,
  type MesaCriarEntrada as MesaNova,
  type MesaAtualizarEntrada as MesaPatch,
  type ComandaAbrirEntrada as ComandaNova,
  type ComandaItemEntrada as ItemNovo,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
