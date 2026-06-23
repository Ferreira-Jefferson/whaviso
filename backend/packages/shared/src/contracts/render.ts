// Substituição de variáveis {{n}} de um template, FONTE ÚNICA do render de texto.
// É o renderizador puro compartilhado entre o PREVIEW da api (admin) e o ENVIO do
// zap (shared/templates), para que "o que o owner vê é o que vai sair" (H12.7).
//
// Semântica do valor AUSENTE (decisão de paridade, E12/M1): uma variável sem valor
// vira STRING VAZIA (igual ao envio real do WhatsApp), nunca um placeholder do tipo
// `{{nome}}`. Assim preview e envio coincidem byte a byte, inclusive quando falta
// um valor. Token fora da faixa de `variaveis` (ex.: {{9}} com 2 variáveis) fica
// INTACTO (não há nome a resolver). Não conhece regra de negócio nem o transporte.

/**
 * Resolve {{1}}..{{n}} de `texto` na ordem de `variaveis`, usando `valores` (mapa
 * nome -> valor). Valor ausente -> '' (string vazia). {{n}} fora da faixa fica
 * intacto. Função pura, determinística; mesma saída na api e no zap.
 */
export function renderizarTexto(
  texto: string,
  variaveis: string[],
  valores: Record<string, string>,
): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (inteiro, n: string) => {
    const nome = variaveis[Number(n) - 1]
    if (nome === undefined) return inteiro // token fora da faixa: não há variável
    return valores[nome] ?? '' // valor ausente: string vazia (paridade com o envio)
  })
}
