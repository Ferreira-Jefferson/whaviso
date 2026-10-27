// Contratos de borda do modulo campanhas. Fonte unica: contracts/campanhas do @whaviso/shared
// (o codegen reemite para o front). Aqui fica apenas o parametro de rota :id (plumbing server-side).
// TODO(integrador): depois de `export * from './campanhas'` no barrel de contracts, trocar o import
// relativo abaixo por '@whaviso/shared/contracts' (padrao do projeto; ver o modulo crm).
import { z } from 'zod'

export {
  CampanhaEntrada,
  CampanhaItem,
  CampanhasSaida,
  CampanhaDetalheSaida,
  CampanhaEntregaResumo,
  CampanhaDestinatariosSaida,
  CampanhaDisparoSaida,
  CampanhaCancelarSaida,
  CampanhaFiltro,
  CampanhaVariaveis,
  CampanhaStatus,
  campanhaStatus,
  CampanhaSegmento,
  campanhaSegmentos,
  type CampanhaNova,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
