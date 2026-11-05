// Apresentacao READ-ONLY das conversas no visualizador do console (replica enxuta de
// modules/conversas/estados.ts; modulo nunca importa modulo). So o necessario para LER: rotulo e
// cor do status, lado/rotulo da bolha e o texto exibido por tipo. Nenhuma acao de escrita.
import type { AutorMensagem, StatusConversa, TipoMensagem } from '@/shared/contracts/_generated/enums'
import type { MensagemSaida } from '@/shared/contracts/_generated/conversas'

export type TomBadge = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro'

export const ROTULO_STATUS_CONVERSA: Record<StatusConversa, string> = {
  ia: 'Com a automação',
  aguardando: 'Aguardando atendente',
  humano: 'Em atendimento',
  encerrada: 'Encerrada',
}

export const TOM_STATUS_CONVERSA: Record<StatusConversa, TomBadge> = {
  ia: 'marca',
  aguardando: 'atencao',
  humano: 'sucesso',
  encerrada: 'neutro',
}

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
  texto: string
  placeholder: boolean
}

/** O que mostrar na bolha para cada tipo. Nunca expomos `midia_ref` (referencia interna). */
export function conteudoExibido(m: MensagemSaida): ConteudoExibido {
  if (m.tipo === 'texto' && m.conteudo) return { texto: m.conteudo, placeholder: false }
  if (m.tipo === 'audio' && m.transcricao) return { texto: m.transcricao, placeholder: false }
  if (m.tipo === 'interativo' && m.conteudo) return { texto: m.conteudo, placeholder: false }
  if (m.conteudo) return { texto: m.conteudo, placeholder: false }
  const rotulo = m.tipo === 'texto' ? 'Mensagem' : ROTULO_MIDIA[m.tipo]
  return { texto: rotulo, placeholder: true }
}

/** Previa curta da ultima mensagem na lista. */
export function previaLista(previa: string | null, tipo: TipoMensagem): string {
  if (previa && previa.trim()) return previa
  if (tipo === 'texto') return 'Mensagem'
  return ROTULO_MIDIA[tipo as Exclude<TipoMensagem, 'texto'>]
}
