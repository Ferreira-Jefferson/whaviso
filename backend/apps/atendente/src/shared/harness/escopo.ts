// Trava de escopo (so venda e pedido da loja): contador de insistencia DERIVADO e decisao pura.
// Sem estado novo: conta quantas saidas consecutivas da IA (mais recentes) sao textos de recusa.
// Em silencio nao ha saida, entao o contador se mantem ate o cliente voltar ao tema (a resposta
// normal quebra a sequencia). Economiza a chave BYO da loja sem ser rude (1 aviso final e silencio).
import { TEXTOS_RECUSA_ESCOPO } from './constantes'

/** Recusas consecutivas no topo (mais recente primeiro). Uma saida que nao e recusa zera. */
export function contarRecusasConsecutivas(saidasRecentesIa: readonly string[]): number {
  let n = 0
  for (const s of saidasRecentesIa) {
    if (!TEXTOS_RECUSA_ESCOPO.includes(s)) break
    n++
  }
  return n
}

export type AcaoEscopo = 'redirecionar' | 'aviso_final' | 'silencio'

/** `recusasAntes` = contador derivado ANTES desta mensagem off-topic. */
export function decidirEscopo(recusasAntes: number, limiar: number): AcaoEscopo {
  const n = recusasAntes + 1
  if (n > limiar) return 'silencio'
  if (n === limiar) return 'aviso_final'
  return 'redirecionar'
}

/** Em silencio so uma mensagem que PARECE da loja merece a chamada de classificacao que reativa. */
const TEMA_DA_LOJA =
  /(cardapio|pedido|pedir|quero|queria|gostaria|vou querer|lanche|pizza|hamburguer|burger|bebida|suco|refri|combo|porcao|preco|valor|quanto|entrega|entregar|taxa|endereco|pagamento|pix|dinheiro|cartao|horario|aberto|fechado|status|cade|acompanhar|cancelar|confirmar|atendente|humano|pessoa)/

export function pareceTemaDaLoja(texto: string): boolean {
  return TEMA_DA_LOJA.test(texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase())
}
