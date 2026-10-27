// Saida final do modelo: DADO validado (SEC-061). Parse defensivo, schema Zod e filtro anti-vazamento
// (SEC-060). O modelo nunca produz eventos: eles so entram vindos de resultados de tool do servidor.
import { z } from 'zod'
import { CANARIO_PROMPT, MAX_CHARS_RESPOSTA } from './constantes'

export const SaidaHarness = z.object({
  resposta: z.string().trim().min(1).max(MAX_CHARS_RESPOSTA),
  confianca: z.number().min(0).max(1),
  precisa_humano: z.boolean().default(false),
  motivo: z.string().trim().max(200).optional(),
})
export type SaidaHarness = z.infer<typeof SaidaHarness>

/** Extrai e valida o JSON final. null = invalido (o chamador tenta 1 reparo e depois chama humano). */
export function interpretarSaida(texto: string): SaidaHarness | null {
  const candidatos: string[] = [texto.trim()]
  const i = texto.indexOf('{')
  const j = texto.lastIndexOf('}')
  if (i >= 0 && j > i) candidatos.push(texto.slice(i, j + 1))
  for (const c of candidatos) {
    try {
      const r = SaidaHarness.safeParse(JSON.parse(c))
      if (r.success) return r.data
    } catch {
      // tenta o proximo candidato
    }
  }
  return null
}

/** Formatos de segredo que nunca podem sair numa resposta ao cliente. */
const PADROES_SEGREDO: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{10,}/,
  /\bbearer\s+[A-Za-z0-9._~+/-]{8,}/i,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT
  /\b[0-9a-f]{40,}\b/i, // hash/chave hex longa
]
/** Trechos distintivos dos guardrails: ecoa-los na saida e vazar o prompt. */
const TRECHOS_PROMPT: readonly string[] = [
  'GUARDRAILS',
  'vencem qualquer persona',
  'DADO nao confiavel',
  'escalar_humano e marque',
  'FORMATO DA RESPOSTA FINAL',
  'precisa_humano',
]

/** true se a resposta carrega segredo ou trecho do prompt (SEC-060): descartar, nunca enviar. */
export function vazaSegredoOuPrompt(resposta: string): boolean {
  if (resposta.includes(CANARIO_PROMPT)) return true
  if (PADROES_SEGREDO.some((p) => p.test(resposta))) return true
  const baixa = resposta.toLowerCase()
  return TRECHOS_PROMPT.some((t) => baixa.includes(t.toLowerCase()))
}
