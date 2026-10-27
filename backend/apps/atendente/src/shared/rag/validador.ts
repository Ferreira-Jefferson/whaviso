// Validador deterministico de conteudo de conhecimento (RAG.md secao 3, "a trava critica").
//
// A base guarda so o que e ESTAVEL e textual (descricoes, regras, FAQ). Dado ao-vivo (preco,
// disponibilidade, status de pedido, taxa) NUNCA entra no indice: um reajuste no painel deixaria o
// indice mentindo com confianca. Este validador barra, por CONSTRUCAO, o que cheira a dado vivo, a
// PII (telefone/Pix) ou a segredo (token/chave) antes de qualquer chunk/embedding ou entrada de cache.
//
// E heuristica, de proposito conservadora (prefere barrar demais a deixar passar dado volatil). Usado
// na ingestao (barra o documento) e no cache semantico (classifica a pergunta/resposta antes de servir).

export interface ResultadoValidacao {
  ok: boolean
  /** Motivos legiveis do bloqueio (nunca ecoa o texto sensivel; so a categoria). */
  motivos: string[]
}

/** Padroes que denunciam dado vivo / PII / segredo. Cada par [categoria, regex]. */
const PADROES: ReadonlyArray<readonly [string, RegExp]> = [
  ['preco', /r\$\s*\d/i],
  ['preco', /\b\d{1,4}[.,]\d{2}\s*(reais|conto)\b/i],
  ['temporal', /\b(hoje|agora|neste momento|no momento)\b/i],
  // RAG.md secao 3 lista explicitamente "esgotado" e "disponivel" como sinais de dado vivo a barrar.
  ['disponibilidade', /\b(esgotad[oa]s?|indispon[ií]ve(l|is)|dispon[ií]ve(l|is)|em estoque|fora de estoque|acabou)\b/i],
  ['status_pedido', /\b(status do pedido|pedido\s*#?\s*\d|saiu para entrega|a caminho|pedido pronto)\b/i],
  ['telefone', /(\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/],
  ['pix', /\b(pix|chave pix|br\s?code|copia e cola|qr\s?code)\b/i],
  ['segredo', /\b(sk-[a-z0-9-]{8,}|bearer\s+[a-z0-9._-]{8,}|api[_\s-]?key|token\s*[:=])/i],
  ['segredo', /\b[A-Za-z0-9_-]{40,}\b/],
]

/**
 * Valida o conteudo de um candidato a conhecimento. ok=false se detectar dado vivo, PII ou segredo.
 * Nunca lanca; nunca devolve o trecho ofensor (so a categoria), para nao vazar em log.
 */
export function validarConteudoConhecimento(texto: string): ResultadoValidacao {
  const motivos: string[] = []
  for (const [categoria, re] of PADROES) {
    if (re.test(texto) && !motivos.includes(categoria)) motivos.push(categoria)
  }
  return { ok: motivos.length === 0, motivos }
}

/**
 * Pode virar entrada de cache semantico? So perguntas/respostas ESTAVEIS (RAG.md secao 6): a resposta
 * nunca pode conter preco/disponibilidade/status. Classifica os dois textos antes de servir/gravar.
 */
export function podeCachear(pergunta: string, resposta: string): boolean {
  return validarConteudoConhecimento(pergunta).ok && validarConteudoConhecimento(resposta).ok
}
