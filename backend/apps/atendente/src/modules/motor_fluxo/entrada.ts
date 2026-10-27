// Normalizacao PURA da mensagem de entrada para o evento do turno, e o mapeamento de uma
// resposta a um id apresentado. O id que o cliente manda e entrada NAO confiavel: so e aceito
// se foi um dos ids que ESTE motor ofereceu no ultimo menu (apresentados), e o id ainda sera
// revalidado contra a loja no node. A resposta numerica mapeia por posicao na lista apresentada.
import type { EventoTurno } from './tipos'

export interface MensagemEntradaRow {
  tipo: string
  conteudo: string | null
}

export function normalizarMensagem(row: MensagemEntradaRow): EventoTurno {
  const conteudo = row.conteudo?.trim() || null
  if (row.tipo === 'interativo') return { tipo: 'botao', texto: null, botaoId: conteudo }
  if (row.tipo === 'texto') return { tipo: 'texto', texto: conteudo, botaoId: null }
  return { tipo: 'outro', texto: conteudo, botaoId: null }
}

/** Resolve a escolha do cliente num menu numerado: id apresentado por clique ou numero (1-based). */
export function escolherDaLista(evento: EventoTurno, apresentados: readonly string[]): string | null {
  if (evento.botaoId && apresentados.includes(evento.botaoId)) return evento.botaoId
  const texto = evento.texto ?? ''
  if (/^\d+$/.test(texto)) {
    const n = Number(texto)
    if (n >= 1 && n <= apresentados.length) return apresentados[n - 1] ?? null
  }
  return null
}

/** true se o cliente clicou exatamente o botao literal `id` (botoes interativos nao indexados). */
export function botaoIgual(evento: EventoTurno, id: string): boolean {
  return evento.botaoId === id
}
