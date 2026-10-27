// Utilitarios de texto PUROS para dedup e recorrencia: normalizacao, hash de conteudo e similaridade
// de tokens (Jaccard). Deterministico e sem dependencia de banco (facil de testar). O hash alimenta
// `documentos.hash_conteudo` (dedup exato); a assinatura agrupa perguntas quase iguais (recorrencia);
// o Jaccard aproxima a similaridade com documentos aprovados/rascunhos pendentes (antilixo).
import { createHash } from 'node:crypto'

/** Normaliza para comparacao: minusculas, sem acento, pontuacao virando espaco, espacos colapsados. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Hash sha256 (hex) do conteudo normalizado: casa com o formato de `documentos.hash_conteudo`. */
export function hashConteudo(s: string): string {
  return createHash('sha256').update(normalizar(s)).digest('hex')
}

/** Assinatura curta para agrupar perguntas recorrentes (normalizada, sem stopwords triviais). */
const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'um', 'uma',
  'para', 'pra', 'por', 'com', 'que', 'se', 'ao', 'the', 'is',
])

/** Conjunto de tokens significativos (sem stopwords, sem duplicatas) de um texto normalizado. */
export function tokens(s: string): Set<string> {
  const set = new Set<string>()
  for (const t of normalizar(s).split(' ')) {
    if (t.length >= 2 && !STOPWORDS.has(t)) set.add(t)
  }
  return set
}

/** Assinatura de agrupamento: tokens significativos ordenados (perguntas quase iguais colidem). */
export function assinatura(s: string): string {
  return [...tokens(s)].sort().join(' ')
}

/** Similaridade de Jaccard entre os conjuntos de tokens de dois textos (0 a 1). */
export function jaccard(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 && tb.size === 0) return 1
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}
