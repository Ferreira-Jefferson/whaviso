// Contratos de borda do modulo zonas_entrega. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'
import { UuidSchema } from '@whaviso/shared/contracts'

export {
  ZonaEntrada,
  ZonaAtualizarEntrada,
  ZonaLoteEntrada,
  ZonaSaida,
  ZonaListaSaida,
  ZonaListaQuery,
  ResolverZonaEntrada,
  ResolverZonaSaida,
  type ZonaNova,
  type ZonaPatch,
  type ZonaLote,
  type ZonaDto,
  type ResolverZonaDto,
  type ZonaAreaPoligonoDto,
  type ZonaAreaRaioDto,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: UuidSchema })
