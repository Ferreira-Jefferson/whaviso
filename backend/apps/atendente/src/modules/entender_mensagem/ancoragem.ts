// Ancoragem DETERMINISTICA de nomes citados pelo cliente a itens reais do cardapio da loja.
// Normaliza (caixa, acento, pontuacao) e pontua por igualdade e sobreposicao de tokens.
// Sem correspondencia ou empate => nao ancora (o motor pede esclarecimento). NUNCA inventa item.
import type { ItemAncorado, ItemCardapio } from './tipos'

const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'um', 'uma', 'o', 'a', 'os', 'as', 'com', 'e', 'no', 'na'])
const LIMIAR_SCORE = 0.5

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  return normalizar(s)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)) // plural simples
}

function pontuar(citado: string, nomeItem: string): number {
  const nc = normalizar(citado)
  const ni = normalizar(nomeItem)
  if (!nc || !ni) return 0
  if (nc === ni) return 1
  const tc = tokens(citado)
  const ti = tokens(nomeItem)
  if (tc.length === 0 || ti.length === 0) return 0
  const setI = new Set(ti)
  const comuns = tc.filter((t) => setI.has(t)).length
  if (comuns === 0) return 0
  // Cobertura do que o cliente disse pesa mais que a cobertura do nome do item.
  return 0.7 * (comuns / tc.length) + 0.3 * (comuns / ti.length)
}

export function ancorarItem(citado: string, itens: readonly ItemCardapio[]): ItemAncorado {
  const pontuados = itens
    .map((item) => ({ item, score: pontuar(citado, item.nome) }))
    .filter((p) => p.score >= LIMIAR_SCORE)
    .sort((a, b) => b.score - a.score)
  const melhor = pontuados[0]
  if (!melhor) return { estado: 'sem_correspondencia', citado }
  const empatados = pontuados.filter((p) => Math.abs(p.score - melhor.score) < 1e-9)
  if (empatados.length > 1) {
    return { estado: 'ambiguo', citado, candidatos: empatados.slice(0, 5).map((p) => p.item) }
  }
  return { estado: 'ancorado', itemId: melhor.item.id, nome: melhor.item.nome, citado }
}
