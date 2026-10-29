// Escopo do motor de atendimento: a costura que torna WhatsApp + LLM + RAG compartilhaveis entre
// "loja" (hoje) e "plataforma" (Fase B) sem duplicar o motor. O escopo vem SEMPRE do servidor
// (conversa resolvida), nunca de texto do cliente nem da saida do modelo (SEC-002/062).
//
// Nesta fase so `tipo: 'loja'` existe em uso e a coluna de isolamento segue sendo `loja_id`.
// `idLoja` e a UNICA ponte escopo -> coluna: falha fechada para qualquer tipo sem coluna definida,
// de modo que um escopo nao-loja nunca vira `where loja_id = <id>` por engano (RAG-ISO-001).

export type TipoEscopo = 'loja' | 'plataforma'

export interface Escopo {
  readonly tipo: TipoEscopo
  readonly id: string
}

/** Escopo de uma loja: quem chama resolve `loja -> { tipo: 'loja', id: lojaId }`. */
export function escopoLoja(lojaId: string): Escopo {
  return Object.freeze({ tipo: 'loja', id: lojaId })
}

/**
 * Valor do pre-filtro `loja_id = $1` para o escopo. Falha fechada (lanca) se o escopo nao for de
 * loja: a coluna de escopo da plataforma e Fase B, e ate la nada pode consultar por ela.
 */
export function idLoja(escopo: Escopo): string {
  if (escopo.tipo !== 'loja') throw new Error(`escopo '${escopo.tipo}' sem coluna de isolamento definida`)
  return escopo.id
}
