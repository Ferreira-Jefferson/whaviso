// Tokenizador da formatação do WhatsApp (negrito e itálico) para o preview.
//
// O texto continua vindo renderizado do backend (variáveis já substituídas); este
// util é PURAMENTE VISUAL: quebra a string em segmentos marcando quais estão em
// *negrito* e/ou _itálico_, para o WhatsAppPreview desenhar <strong>/<em> em vez de
// mostrar os asteriscos/underscores crus. Não altera nada do que é enviado.
//
// Regras (espelham o WhatsApp de forma pragmática):
// - `*trecho*` = negrito, `_trecho_` = itálico; delimitadores PAREADOS e não-vazios.
// - Suporta um nível de aninhamento (`*negrito _e itálico_*`).
// - Marcador sem par fica literal (aparece o caractere).
// - Espaços e quebras de linha são preservados (o <p> do preview é whitespace-pre-wrap).

export interface SegmentoWa {
  texto: string
  negrito: boolean
  italico: boolean
}

const MARCADORES: Record<string, 'negrito' | 'italico'> = {
  '*': 'negrito',
  _: 'italico',
}

/** Quebra o texto em segmentos com flags de negrito/itálico, mesclando os adjacentes iguais. */
export function tokenizarWhatsApp(texto: string): SegmentoWa[] {
  const segmentos: SegmentoWa[] = []
  analisar(texto, false, false, segmentos)
  return combinar(segmentos)
}

function analisar(texto: string, negrito: boolean, italico: boolean, saida: SegmentoWa[]): void {
  let i = 0
  let inicioLiteral = 0
  while (i < texto.length) {
    const ch = texto[i]!
    const tipo = MARCADORES[ch]
    // Não reabrir um marcador já ativo (evita recursão infinita e casa com o WhatsApp).
    const jaAtivo = (tipo === 'negrito' && negrito) || (tipo === 'italico' && italico)
    if (tipo && !jaAtivo) {
      const fim = texto.indexOf(ch, i + 1)
      if (fim > i + 1) {
        // Conteúdo não-vazio entre marcadores: fecha o literal pendente e recorre no miolo.
        empurrar(saida, texto.slice(inicioLiteral, i), negrito, italico)
        analisar(
          texto.slice(i + 1, fim),
          negrito || tipo === 'negrito',
          italico || tipo === 'italico',
          saida,
        )
        i = fim + 1
        inicioLiteral = i
        continue
      }
    }
    i++
  }
  empurrar(saida, texto.slice(inicioLiteral), negrito, italico)
}

function empurrar(saida: SegmentoWa[], texto: string, negrito: boolean, italico: boolean): void {
  if (texto) saida.push({ texto, negrito, italico })
}

function combinar(segmentos: SegmentoWa[]): SegmentoWa[] {
  const saida: SegmentoWa[] = []
  for (const s of segmentos) {
    const ultimo = saida[saida.length - 1]
    if (ultimo && ultimo.negrito === s.negrito && ultimo.italico === s.italico) {
      ultimo.texto += s.texto
    } else {
      saida.push({ ...s })
    }
  }
  return saida
}
