// Fonte única das regras de linguagem do produto (H13.9). Tudo que chega ao
// produto, ao usuário e ao código obedece a este arquivo: templates, copy de UI,
// mensagens do zap, nomes no banco, erros da API, comentários de código.
//
// REGRA DE OURO nº1: nunca usar vocabulário proibido (dívida/devendo/atraso/
// cobrança/inadimplência). Vocabulário aprovado: aviso / lembrete / combinado.
// REGRA DE OURO nº2: nunca usar travessão (em dash U+2014, en dash U+2013); é
// marca de texto gerado por IA. No lugar: vírgula, dois-pontos, parênteses.
// REGRA DE OURO nº3: mensagens neutras quanto a gênero (não inferir gênero de
// quem recebe); aqui isso vira uma lista de ALERTA (heurística), não bloqueio.
//
// ESPELHO: frontend/src/shared/contracts/linguagem.ts replica EXATAMENTE os três
// padrões (PALAVRAS_PROIBIDAS_PATTERN, TRAVESSAO_PATTERN, GENERO_ALERTA_PATTERNS),
// pois o front não importa @whaviso/shared. Há teste de igualdade dos dois lados.
// Mudar um padrão = mudar os DOIS lados juntos (e o CHECK do banco na tabela
// `templates`: vocabulário proibido na 0022, travessão na 0025). A 0006
// (templates_mensagem) foi dropada na consolidação; não é mais a referência.

export const PALAVRAS_PROIBIDAS_PATTERN =
  '(d[ií]vida|devendo|atras(o|ad)|cobran[çc]a|inadimpl)'

export const PALAVRAS_PROIBIDAS = new RegExp(PALAVRAS_PROIBIDAS_PATTERN, 'i')

// Travessão: SÓ em dash (—, U+2014) e en dash (–, U+2013). NUNCA o hífen ASCII
// `-` (U+002D), que é legítimo em `midia.url`, `acao` com underscore, datas, etc.
export const TRAVESSAO_PATTERN = '[—–]'

export const TRAVESSAO = new RegExp(TRAVESSAO_PATTERN)

// Padrões gendered comuns (artigos/pronomes que assumem masculino/feminino).
// Heurística de ALERTA (gera falso positivo, ex.: "a data", "o valor"), por isso
// é warning, nunca bloqueio. Cada item é uma fonte de RegExp (case-insensitive).
export const GENERO_ALERTA_PATTERNS = [
  // "o/a", "ele/ela", "do/da" (barra entre os dois gêneros)
  '\\b(o|a|ele|ela|do|da|os|as|seu|sua)\\s*/\\s*(o|a|ele|ela|do|da|os|as|seu|sua)\\b',
  // "sou a/o [nome]" (preferir "aqui é [nome]")
  '\\bsou\\s+(o|a)\\b',
  // artigo gendered antes de papel/pessoa ("o cobrador", "a responsável")
  '\\b(o|a|os|as)\\s+(cobrador|devedor|respons[aá]ve(l|is)|usu[aá]rio|cliente|titular|convidad[oa])\\b',
  // saudações/agradecimentos gendered
  'bem-?vind[oa]\\b',
  'obrigad[oa]\\b',
] as const

/** Retorna a primeira palavra proibida encontrada, ou null se o texto está limpo. */
export function lintLinguagem(texto: string): string | null {
  const m = PALAVRAS_PROIBIDAS.exec(texto)
  return m ? m[0] : null
}

/** Retorna o caractere de travessão encontrado, ou null se o texto está limpo. */
export function lintTravessao(texto: string): string | null {
  const m = TRAVESSAO.exec(texto)
  return m ? m[0] : null
}

/**
 * Lista de trechos que ACENDEM o alerta de gênero (heurística, warning).
 * Não bloqueia o salvamento (H13.10 🟡): gênero neutro é difícil de automatizar
 * com precisão, então só sinaliza os padrões mais comuns para revisão humana.
 */
export function alertaGenero(texto: string): string[] {
  const achados: string[] = []
  for (const fonte of GENERO_ALERTA_PATTERNS) {
    const re = new RegExp(fonte, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(texto)) !== null) {
      achados.push(m[0].trim())
      if (m.index === re.lastIndex) re.lastIndex++ // evita laço infinito em match vazio
    }
  }
  return achados
}
