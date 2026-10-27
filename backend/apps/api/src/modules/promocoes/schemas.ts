// Contratos de borda do modulo promocoes. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'

export {
  PromocaoTipo,
  PromocaoCriarEntrada,
  PromocaoAtualizarEntrada,
  PromocaoListaEntrada,
  PromocaoSaida,
  PromocaoListaSaida,
  PromocaoValidarEntrada,
  PromocaoValidarSaida,
  PromocaoUsoEntrada,
  PromocaoUsoSaida,
  type PromocaoCriar,
  type PromocaoAtualizar,
  type PromocaoValidar,
  type PromocaoDto,
  type PromocaoMotivo,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
