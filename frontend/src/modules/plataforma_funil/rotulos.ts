// Rotulos, tons e regras de UX do funil de aquisicao. As transicoes espelham o servidor so para
// mostrar as acoes certas; quem decide e o servidor (409/422 com mensagem).
import type { EstagioProspecto, TipoAtividadeProspecto } from '@/shared/contracts/_generated/enums'
import { formatarDataHora } from '@/shared/format'

export type TomBadge = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro'

export const ESTAGIOS: ReadonlyArray<EstagioProspecto> = ['novo', 'contato', 'proposta', 'ativo', 'perdido']

export const ROTULO_ESTAGIO: Record<EstagioProspecto, string> = {
  novo: 'Novo',
  contato: 'Em contato',
  proposta: 'Proposta enviada',
  ativo: 'Virou cliente',
  perdido: 'Perdido',
}

export const TOM_ESTAGIO: Record<EstagioProspecto, TomBadge> = {
  novo: 'neutro',
  contato: 'marca',
  proposta: 'atencao',
  ativo: 'sucesso',
  perdido: 'erro',
}

/** Destinos validos a partir de cada estagio. `ativo` so nasce do vinculo de conta, nunca daqui. */
export const TRANSICOES: Record<EstagioProspecto, ReadonlyArray<EstagioProspecto>> = {
  novo: ['contato', 'perdido'],
  contato: ['proposta', 'perdido', 'novo'],
  proposta: ['contato', 'perdido'],
  ativo: [],
  perdido: ['novo'],
}

export const ACAO_ESTAGIO: Record<EstagioProspecto, string> = {
  novo: 'Reabrir como novo',
  contato: 'Marcar em contato',
  proposta: 'Marcar proposta enviada',
  ativo: 'Virou cliente',
  perdido: 'Marcar como perdido',
}

export const ROTULO_ATIVIDADE: Record<TipoAtividadeProspecto, string> = {
  nota: 'Nota',
  ligacao: 'Ligação',
  mensagem: 'Mensagem',
  reuniao: 'Reunião',
  follow_up: 'Follow-up',
}

/** Formatos de conclusao de um follow-up (nunca um novo follow-up). */
export const TIPOS_CONCLUSAO: ReadonlyArray<Exclude<TipoAtividadeProspecto, 'follow_up'>> = [
  'ligacao',
  'mensagem',
  'reuniao',
  'nota',
]

/** Instante (ISO UTC) em America/Sao_Paulo; se vier fora do ISO, devolve o texto cru. */
export function quando(iso: string): string {
  try {
    return formatarDataHora(iso)
  } catch {
    return iso
  }
}

/** 'YYYY-MM-DD' + 'HH:mm' -> ISO com offset de Sao Paulo (UTC-3, sem horario de verao desde 2019). */
export function isoSaoPaulo(data: string, hora: string): string {
  return `${data}T${hora}:00-03:00`
}
