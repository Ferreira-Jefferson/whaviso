// Configuracao do cliente de LLM: tipos de provedor, tabela de precos (estimativa de custo) e
// teto de gasto. Tudo e DADO (sem numero magico espalhado) e injetavel nos testes.
//
// Custo e ESTIMATIVA para o painel de gasto e o alerta de pico (SEC-100), nao faturamento. A
// tabela e mantida aqui em config; modelo sem preco conhecido estima custo 0 (nao inventa valor).

/** Provedores suportados (espelha o enum `provedor_llm` da migration 0012). */
export type ProvedorLlm = 'openrouter' | 'anthropic' | 'outro'

/** Preco de um modelo em CENTAVOS por 1.000.000 de tokens (entrada/saida separados, dinheiro em int). */
export interface PrecoModelo {
  entradaCentavosPorMilhao: number
  saidaCentavosPorMilhao: number
}

/** Tabela de precos por nome de modelo. Chave = id do modelo como o provedor o reporta. */
export type TabelaPrecos = Record<string, PrecoModelo>

/**
 * Custo estimado em centavos (int) de uma chamada. Modelo desconhecido => 0 (estimativa honesta,
 * nunca um numero inventado). Dinheiro sempre em centavos inteiros.
 */
export function custoEstimadoCentavos(
  precos: TabelaPrecos,
  modelo: string | null | undefined,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = modelo ? precos[modelo] : undefined
  if (!p) return 0
  const bruto = (tokensIn * p.entradaCentavosPorMilhao + tokensOut * p.saidaCentavosPorMilhao) / 1_000_000
  return Math.max(0, Math.round(bruto))
}

/** Teto de gasto diario por loja, em centavos. 0 = sem teto (nao estoura nunca). */
export const TETO_DIARIO_CENTAVOS_PADRAO = 5_000

/** Base URL e hosts allowlisted do OpenRouter (SEC-070): URL fixa no codigo, nunca vinda do cliente. */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const OPENROUTER_HOSTS: readonly string[] = ['openrouter.ai']

/** Modelo padrao do OpenRouter quando a loja nao definiu `modelo_preferido`. */
export const OPENROUTER_MODELO_PADRAO = 'openai/gpt-4o-mini'

/**
 * Precos padrao (centavos por 1M tokens), aproximados para ESTIMATIVA. Revisar conforme a tabela
 * do provedor; valores sao ponto de partida, nao contrato de faturamento.
 */
export const PRECOS_PADRAO: TabelaPrecos = {
  'openai/gpt-4o-mini': { entradaCentavosPorMilhao: 15, saidaCentavosPorMilhao: 60 },
  'openai/gpt-4o': { entradaCentavosPorMilhao: 250, saidaCentavosPorMilhao: 1_000 },
}
