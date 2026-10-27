// Maquina de transicoes do handoff manual (pura, sem I/O; testavel isolada).
// So duas transicoes sao validas; 'encerrada' e terminal (nunca transiciona).
import type { StatusConversa } from '@whaviso/shared/contracts'

export type AcaoHandoff = 'assumir' | 'devolver'

/** Tabela explicita de (acao -> de -> para). Fonte unica das transicoes. */
export const TRANSICOES: Record<AcaoHandoff, { de: StatusConversa; para: StatusConversa }> = {
  assumir: { de: 'ia', para: 'humano' },
  devolver: { de: 'humano', para: 'ia' },
}

/** Status resultante da acao a partir de `atual`, ou null se a transicao nao e permitida. */
export function proximoStatus(acao: AcaoHandoff, atual: StatusConversa): StatusConversa | null {
  const t = TRANSICOES[acao]
  return atual === t.de ? t.para : null
}
