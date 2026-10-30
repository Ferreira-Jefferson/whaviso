// Contratos de borda: reexporta os do shared e define so o que e local da rota.
import { z } from 'zod'
import { UuidSchema } from '@whaviso/shared/contracts'

export {
  EvalSuite, EvalSuiteCriar, EvalSuiteAtualizar, EvalSuiteLista, EvalCaso, EvalCasoCriar,
  EvalCasoAtualizar, EvalCasoLista, EvalExecucao, EvalExecucaoCriar, EvalExecucaoFiltro,
  EvalExecucaoLista, EvalExecucaoDetalhe, EvalComparar, EvalComparacao, EvalBaselineDefinir,
  EvalResultado, evalPayloadPorTipo,
  type EvalTipo, type EvalDiffCaso, type EvalDeltasAgregados, type EvalResumo,
} from '@whaviso/shared/contracts'

export const IdParam = z.strictObject({ id: UuidSchema })
export const SuitesQuery = z.strictObject({
  ativo: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
})
export const LojaAlvo = z.strictObject({ id: UuidSchema, nome: z.string() })
export const LojasAlvoLista = z.array(LojaAlvo)
