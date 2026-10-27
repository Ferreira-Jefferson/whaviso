// Contratos de borda do modulo conversas. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'

export {
  TEXTO_MAX,
  PREVIA_MAX,
  LIMITE_PADRAO,
  LIMITE_MAXIMO,
  ConversaListaEntrada,
  MensagensEntrada,
  MensagemEnviarEntrada,
  ConversaEncerrarEntrada,
  ClienteResumo,
  JanelaSaida,
  ConversaListaItem,
  ConversaListaSaida,
  PedidoLigado,
  ConversaDetalheSaida,
  MensagemSaida,
  MensagensSaida,
  MensagemEnviadaSaida,
  ConversaEncerradaSaida,
  ConversaHandoffSaida,
  LidaSaida,
} from '@whaviso/shared/contracts'

export const ParamConversa = z.strictObject({ id: z.uuid() })
