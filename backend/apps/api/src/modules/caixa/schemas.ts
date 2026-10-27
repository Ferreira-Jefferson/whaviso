// Contratos de borda do modulo caixa. Fonte unica: @whaviso/shared/contracts (o codegen reemite
// para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'

export {
  CaixaAbrirEntrada,
  MovimentoEntrada,
  CaixaFecharEntrada,
  CaixaSaida,
  SessaoAbertaSaida,
  MovimentoSaida,
  CaixaRelatorioSaida,
  tipoMovimentoCaixa,
  formaPagamento,
  statusCaixa,
  type TipoMovimentoCaixa,
  type FormaPagamento,
  type StatusCaixa,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
