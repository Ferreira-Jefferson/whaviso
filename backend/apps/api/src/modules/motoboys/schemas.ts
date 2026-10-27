// Contratos de borda do modulo motoboys. Fonte unica: contracts/motoboys (o codegen reemite para o
// front). Aqui ficam apenas os parametros de rota (plumbing server-side).
// TODO(integracao): trocar este caminho relativo por '@whaviso/shared/contracts' assim que o
// barrel exportar './motoboys' (nao editado por este modulo).
import { z } from 'zod'

export {
  MotoboyEntrada,
  MotoboyAtualizarEntrada,
  MotoboyListaQuery,
  MotoboySaida,
  MotoboyListaSaida,
  MotoboySeletorSaida,
  MotoboySeletorListaSaida,
  MotoboyPixSaida,
  LancamentoManualEntrada,
  LancamentoSaida,
  FechamentoDiaQuery,
  FechamentoLinha,
  FechamentoDia,
  PagarFechamentoEntrada,
  MotoboyResumoQuery,
  MotoboyResumoLinha,
  MotoboyResumoPeriodo,
  type MotoboyNovo,
  type MotoboyPatch,
  type MotoboyDto,
  type MotoboySeletorDto,
  type LancamentoNovo,
  type LancamentoDto,
  type FechamentoLinhaDto,
  type FechamentoDiaDto,
  type MotoboyResumoPeriodoDto,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
