// ESPELHO de backend/packages/shared/src/contracts/linguagem.ts
// O front não importa @whaviso/shared, então os TRÊS padrões abaixo são CÓPIAS
// dos do backend (PALAVRAS_PROIBIDAS_PATTERN, TRAVESSAO_PATTERN,
// GENERO_ALERTA_PATTERNS). Há teste de igualdade que lê o arquivo do backend e
// compara as strings; mudar um padrão = mudar os DOIS lados juntos.
//
// REGRA DE OURO nº1: vocabulário proibido (dívida/devendo/atraso/cobrança/
// inadimplência). Aprovado: aviso / lembrete / combinado.
// REGRA DE OURO nº2: sem travessão (em dash —, en dash –); nunca o hífen ASCII -.
// REGRA DE OURO nº3: mensagens neutras quanto a gênero (lista de ALERTA).

export const PALAVRAS_PROIBIDAS_PATTERN =
  '(d[ií]vida|devendo|atras(o|ad)|cobran[çc]a|inadimpl)'

export const PALAVRAS_PROIBIDAS = new RegExp(PALAVRAS_PROIBIDAS_PATTERN, 'i')

// Travessão: SÓ em dash (—, U+2014) e en dash (–, U+2013). NUNCA o hífen ASCII -.
export const TRAVESSAO_PATTERN = '[—–]'

export const TRAVESSAO = new RegExp(TRAVESSAO_PATTERN)

// Padrões gendered comuns (heurística de ALERTA, warning, nunca bloqueio).
export const GENERO_ALERTA_PATTERNS = [
  '\\b(o|a|ele|ela|do|da|os|as|seu|sua)\\s*/\\s*(o|a|ele|ela|do|da|os|as|seu|sua)\\b',
  '\\bsou\\s+(o|a)\\b',
  '\\b(o|a|os|as)\\s+(cobrador|devedor|respons[aá]ve(l|is)|usu[aá]rio|cliente|titular|convidad[oa])\\b',
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

/** Lista de trechos que acendem o alerta de gênero (heurística, warning). */
export function alertaGenero(texto: string): string[] {
  const achados: string[] = []
  for (const fonte of GENERO_ALERTA_PATTERNS) {
    const re = new RegExp(fonte, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(texto)) !== null) {
      achados.push(m[0].trim())
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  return achados
}
