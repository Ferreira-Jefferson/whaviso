// Fiacao de PRODUCAO do cliente de LLM: adaptador OpenRouter (unico implementado hoje; anthropic/
// outro ficam sem adaptador => falha fechada), decifra padrao (lazy, lendo `LLM_MASTER_KEY` so no
// primeiro uso), precos e teto padrao. Trocar/adicionar provedor e mudanca pontual aqui, sem tocar
// nos chamadores.
import type { Logger } from '@whaviso/shared/logger'
import { PRECOS_PADRAO, TETO_DIARIO_CENTAVOS_PADRAO, type TabelaPrecos } from './config'
import { decifraPadrao } from './cifra'
import { criarAdaptadorOpenRouter, type OpcoesOpenRouter } from './provedores/openrouter'
import { resolverPorRegistro } from './provedores/porta'
import { criarServicoLlm, type ServicoLlm } from './servico'

export interface OpcoesServicoProducao {
  logger: Logger
  precos?: TabelaPrecos
  tetoDiarioCentavos?: number
  opcoesOpenRouter?: OpcoesOpenRouter
}

/** Servico de LLM pronto para producao (OpenRouter + decifra via LLM_MASTER_KEY). */
export function criarServicoLlmProducao(op: OpcoesServicoProducao): ServicoLlm {
  const openrouter = criarAdaptadorOpenRouter(op.opcoesOpenRouter ?? {})
  return criarServicoLlm({
    obterDecifra: decifraPadrao,
    resolverAdaptador: resolverPorRegistro({ openrouter }),
    logger: op.logger,
    precos: op.precos ?? PRECOS_PADRAO,
    tetoDiarioCentavos: op.tetoDiarioCentavos ?? TETO_DIARIO_CENTAVOS_PADRAO,
  })
}
