// Trava de conteudo estavel (RAG.md secao 3): a base guarda so descricao/regra/FAQ/politica. Dado
// vivo (preco, disponibilidade, status), PII (telefone/Pix) e segredo (token/chave) sao barrados por
// construcao antes de aprovar. Heuristica conservadora, espelho local da regra do ingestor do
// atendente (cada app tem a sua copia; apps nao se importam). Nunca devolve o trecho ofensor.
export interface ResultadoValidacao {
  ok: boolean
  motivos: string[]
}

const VIVO: ReadonlyArray<readonly [string, RegExp]> = [
  ['preco', /r\$\s*\d/i],
  ['preco', /\b\d{1,4}[.,]\d{2}\s*(reais|conto)\b/i],
  ['temporal', /\b(hoje|agora|neste momento|no momento)\b/i],
  ['disponibilidade', /\b(esgotad[oa]s?|indispon[ií]ve(l|is)|dispon[ií]ve(l|is)|em estoque|fora de estoque|acabou)\b/i],
  ['status_pedido', /\b(status do pedido|pedido\s*#?\s*\d|saiu para entrega|a caminho|pedido pronto)\b/i],
]
const SENSIVEL: ReadonlyArray<readonly [string, RegExp]> = [
  ['telefone', /(\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/],
  ['pix', /\b(pix|chave pix|br\s?code|copia e cola|qr\s?code)\b/i],
  ['segredo', /\b(sk-[a-z0-9-]{8,}|bearer\s+[a-z0-9._-]{8,}|api[_\s-]?key|token\s*[:=])/i],
  ['segredo', /\b[A-Za-z0-9_-]{40,}\b/],
]

function rodar(texto: string, padroes: ReadonlyArray<readonly [string, RegExp]>): ResultadoValidacao {
  const motivos: string[] = []
  for (const [categoria, re] of padroes) {
    if (re.test(texto) && !motivos.includes(categoria)) motivos.push(categoria)
  }
  return { ok: motivos.length === 0, motivos }
}

/** Documento de conhecimento: barra dado vivo, PII e segredo. */
export function validarDocumento(...textos: string[]): ResultadoValidacao {
  return rodar(textos.join('\n'), [...VIVO, ...SENSIVEL])
}

/** Pergunta do golden set: pode falar de preco (duvida tipica), mas nao carregar PII/segredo. */
export function validarPergunta(...textos: string[]): ResultadoValidacao {
  return rodar(textos.join('\n'), SENSIVEL)
}
