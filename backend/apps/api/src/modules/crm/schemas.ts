// Contratos de borda do modulo crm. Fonte unica: contracts/crm do @whaviso/shared (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id (plumbing server-side).
// TODO(integrador): depois de `export * from './crm'` no barrel de contracts, trocar o import
// relativo abaixo por '@whaviso/shared/contracts'.
import { z } from 'zod'

export {
  CrmClientesEntrada,
  CrmClientesSaida,
  CrmClienteItem,
  CrmClienteDetalheSaida,
  CrmConsentimento,
  CrmConsentimentoEntrada,
  CrmItensEntrada,
  CrmItensSaida,
  CrmResumoSaida,
  CrmSegmento,
  crmSegmentos,
  RfmMetricas,
  type CrmClientesBusca,
  type CrmConsentimentoNovo,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
