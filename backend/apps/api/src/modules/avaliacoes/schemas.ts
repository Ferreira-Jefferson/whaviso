// Contratos de borda do modulo avaliacoes. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota (plumbing server-side).
import { z } from 'zod'

export {
  AvaliacaoCriarEntrada,
  AvaliacaoSaida,
  AvaliacoesEntrada,
  AvaliacoesSaida,
  AvaliacoesResumoSaida,
  type AvaliacaoNova,
  type AvaliacaoDto,
  type AvaliacoesBusca,
  type AvaliacoesResumo,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
