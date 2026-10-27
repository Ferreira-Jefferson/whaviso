// Contratos de borda do conhecimento. Fonte unica: contracts/conhecimento do @whaviso/shared (o
// codegen reemite para o front). Aqui so o parametro de rota :id.
// TODO(integrador): apos `export * from './conhecimento'` no barrel de contracts, trocar o import
// relativo abaixo por '@whaviso/shared/contracts' (padrao do projeto).
import { z } from 'zod'

export {
  DocumentoCriar,
  DocumentoAtualizar,
  DocumentosFiltro,
  DocumentoSaida,
  DocumentosSaida,
  DocumentoVersoesSaida,
  AvaliacaoCriar,
  AvaliacaoAtualizar,
  AvaliacaoFiltro,
  AvaliacaoGoldenSaida,
  AvaliacoesGoldenSaida,
  FeedbackFiltro,
  FeedbackSaida,
  FeedbacksSaida,
  FeedbackPromover,
  FeedbackPromovidoSaida,
} from '@whaviso/shared/contracts'

export const ParamId = z.strictObject({ id: z.uuid() })
