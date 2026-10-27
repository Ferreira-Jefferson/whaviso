// Anonimizacao do insumo ANTES do LLM (RAG.md 3, decisao do plano): telefone, nome e endereco do
// cliente nunca saem do banco rumo ao provedor, e o rascunho carrega so conteudo generico. E a
// primeira barreira do SEC-024 (PII nunca vaza) e roda sobre TODO texto que vira `rag_feedback.texto`
// ou prompt. Funcao PURA e deterministica (facil de testar); conservadora (mascara demais a vazar).
//
// A trava de dado vivo (validarConteudoConhecimento do kernel de rag) continua como segunda barreira
// sobre o rascunho gerado; aqui o foco e PII do cliente, nao dado vivo do negocio.

/** Contexto conhecido da conversa para mascarar com precisao (alem das heuristicas por regex). */
export interface ContextoAnonimizacao {
  /** Nome do cliente (clientes.nome), se houver. Mascarado onde aparecer no texto. */
  nomeCliente?: string | null
  /** Logradouros conhecidos do cliente (enderecos.logradouro), mascarados onde aparecerem. */
  logradouros?: readonly string[]
}

const RE_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
// Telefone BR em formatos variados (com/sem DDI, com/sem parenteses, 8 ou 9 digitos).
const RE_TELEFONE = /(\+?55\s*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]?\d{4}/g
const RE_CEP = /\b\d{5}-?\d{3}\b/g
// Sequencia longa de caracteres "cara de chave/token": mesma intuicao do validador do rag.
const RE_SEGREDO = /\b[A-Za-z0-9_-]{40,}\b/g
// Numero de rua apos logradouro ("Rua ..., 123" / "n 123"): mascara o numero, nao a via inteira.
const RE_NUMERO_ENDERECO = /\b(n[oº.]?\s*|n[uúmero]*\s*)\d{1,5}\b/gi

/** Escapa um literal para uso dentro de um RegExp. */
function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Mascara cada palavra (>= 3 letras) de um valor conhecido (nome/logradouro) onde aparecer no texto. */
function mascararValor(texto: string, valor: string, marca: string): string {
  let out = texto
  for (const parte of valor.split(/\s+/)) {
    const limpo = parte.trim()
    if (limpo.length < 3) continue // evita mascarar "de", "da", numeros soltos do nome
    out = out.replace(new RegExp(`\\b${escaparRegex(limpo)}\\b`, 'gi'), marca)
  }
  return out
}

/**
 * Remove PII do cliente do texto, substituindo por marcas genericas. Idempotente e seguro para
 * qualquer entrada (nunca lanca). A ordem importa: primeiro os valores conhecidos (nome/logradouro),
 * depois as heuristicas por regex (email, telefone, CEP, numero de endereco, segredo).
 */
export function anonimizar(texto: string, ctx: ContextoAnonimizacao = {}): string {
  if (!texto) return ''
  let out = texto

  if (ctx.nomeCliente) out = mascararValor(out, ctx.nomeCliente, '[cliente]')
  for (const log of ctx.logradouros ?? []) {
    if (log && log.trim().length >= 3) out = mascararValor(out, log, '[endereco]')
  }

  out = out
    .replace(RE_EMAIL, '[email]')
    .replace(RE_TELEFONE, '[telefone]')
    .replace(RE_CEP, '[cep]')
    .replace(RE_NUMERO_ENDERECO, '[endereco]')
    .replace(RE_SEGREDO, '[omitido]')

  return out.replace(/[ \t]{2,}/g, ' ').trim()
}
