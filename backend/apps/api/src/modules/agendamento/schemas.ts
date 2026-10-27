// Contratos de borda do modulo agendamento. Fonte unica: @whaviso/shared/contracts.
// Aqui fica apenas o parametro de rota (plumbing server-side).
import { z } from 'zod'

export {
  AgendamentoDefinirEntrada,
  AgendamentoSaida,
  AgendamentosEntrada,
  AgendamentosSaida,
  JanelaAgendamento,
  type AgendamentoDefinir,
  type AgendamentoDto,
  type AgendamentosBusca,
} from '@whaviso/shared/contracts'

export const PedidoIdParams = z.strictObject({ pedido_id: z.uuid() })
