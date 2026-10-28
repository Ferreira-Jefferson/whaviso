// Apresentacao do atendimento: rotulos e tons de status/autor, e como exibir cada
// tipo de mensagem. A transicao de estado (ia/humano/encerrada) e decidida pelo
// servidor; aqui so escolhemos rotulo, cor e alinhamento das bolhas.
import type { AutorMensagem, StatusConversa, TipoMensagem } from '@/shared/contracts/_generated/enums'
import type { MensagemSaida } from '@/shared/contracts/_generated/conversas'

export type FiltroStatus = 'todas' | StatusConversa

/** Rotulo curto de cada opcao de filtro. 'ia' aparece como "Automacao" (sem citar IA ao usuario). */
export const ROTULO_FILTRO: Record<FiltroStatus, string> = {
  todas: 'Todas',
  ia: 'Automação',
  aguardando: 'Aguardando atendente',
  humano: 'Em atendimento',
  encerrada: 'Encerradas',
}

/**
 * Ponto colorido (a "elipse") de cada estado, reforcando no filtro a mesma cor que o status
 * tem na lista. 'todas' nao tem cor propria (e o estado neutro, mostrado com um ponto vazado).
 */
export const COR_PONTO_STATUS: Record<StatusConversa, string> = {
  ia: 'bg-salvia',
  humano: 'bg-folha',
  aguardando: 'bg-ambar',
  encerrada: 'bg-tinta-2',
}

/**
 * Ordem dos estados no filtro: UM eixo so, a progressao de vida da conversa (nao dois eixos).
 * O status_conversa e um snapshot mutuamente exclusivo de quem conduz agora + aberta/fechada
 * (ver historias/backend-api/handoff.md): a automacao conduz (ia) -> pede humano e fica na fila
 * (aguardando) -> um humano assume (humano) -> encerrada (terminal). 'todas' fica fora, no topo.
 */
export const ESTADOS_ORDEM: ReadonlyArray<StatusConversa> = ['ia', 'aguardando', 'humano', 'encerrada']

export const ROTULO_STATUS: Record<StatusConversa, string> = {
  ia: 'Com a automação',
  aguardando: 'Aguardando atendente',
  humano: 'Em atendimento',
  encerrada: 'Encerrada',
}

export type TomBadge = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro'

export const TOM_STATUS: Record<StatusConversa, TomBadge> = {
  ia: 'marca',
  aguardando: 'atencao',
  humano: 'sucesso',
  encerrada: 'neutro',
}

/** Rotulo do autor de uma bolha. 'ia' = a automacao; 'humano' = a propria equipe. */
export const ROTULO_AUTOR: Record<AutorMensagem, string> = {
  cliente: 'Cliente',
  ia: 'Automação',
  humano: 'Atendente',
  sistema: 'Sistema',
}

/** Lado da bolha: o cliente entra pela esquerda; a loja (automacao/atendente) sai pela direita. */
export function ladoDaBolha(autor: AutorMensagem): 'esquerda' | 'direita' | 'centro' {
  if (autor === 'cliente') return 'esquerda'
  if (autor === 'sistema') return 'centro'
  return 'direita'
}

const ROTULO_MIDIA: Record<Exclude<TipoMensagem, 'texto'>, string> = {
  audio: 'Áudio',
  imagem: 'Imagem',
  interativo: 'Resposta de botão',
  outro: 'Mensagem',
}

export interface ConteudoExibido {
  /** Texto a renderizar na bolha (ja resolvido a partir do tipo). */
  texto: string
  /** True quando e um substituto de midia (sem texto proprio), para estilizar diferente. */
  placeholder: boolean
}

/**
 * O que mostrar na bolha para cada tipo de mensagem. Texto usa o conteudo; audio usa a
 * transcricao quando houver; imagem/interativo/outro caem num rotulo curto. Nunca expomos
 * `midia_ref` (referencia interna, nao URL publica).
 */
export function conteudoExibido(m: MensagemSaida): ConteudoExibido {
  if (m.tipo === 'texto' && m.conteudo) return { texto: m.conteudo, placeholder: false }
  if (m.tipo === 'audio' && m.transcricao) return { texto: m.transcricao, placeholder: false }
  if (m.tipo === 'interativo' && m.conteudo) return { texto: m.conteudo, placeholder: false }
  if (m.conteudo) return { texto: m.conteudo, placeholder: false }
  const rotulo = m.tipo === 'texto' ? 'Mensagem' : ROTULO_MIDIA[m.tipo]
  return { texto: rotulo, placeholder: true }
}

/** Previa curta da ultima mensagem na lista. Entrada do cliente ganha o prefixo vazio. */
export function previaLista(previa: string | null, tipo: TipoMensagem): string {
  if (previa && previa.trim()) return previa
  if (tipo === 'texto') return 'Mensagem'
  return ROTULO_MIDIA[tipo as Exclude<TipoMensagem, 'texto'>]
}
