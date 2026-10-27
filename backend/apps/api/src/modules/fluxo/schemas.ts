// Contratos de borda do modulo fluxo. Fonte unica: @whaviso/shared/contracts (o codegen reemite
// para o front). Aqui fica apenas o parametro de rota (plumbing server-side).
import { z } from 'zod'

export {
  CATALOGO_NODES,
  FLUXO_LIMITES,
  FLUXO_PADRAO,
  FluxoCatalogoSaida,
  FluxoCriarEntrada,
  FluxoGrafo,
  FluxoRascunhoEntrada,
  FluxoRenomearEntrada,
  FluxoSaida,
  FluxosSaida,
  FluxoValidacaoSaida,
  FluxoVersaoSaida,
  FluxoVersoesSaida,
  type FluxoDto,
  type FluxoErroCodigo,
  type FluxoNovo,
  type FluxoProblema,
  type FluxoValidacao,
  type FluxoVersaoDto,
  type NodeDescritor,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
export const VersaoParams = z.strictObject({ id: z.uuid(), versao: z.coerce.number().int().min(1) })
