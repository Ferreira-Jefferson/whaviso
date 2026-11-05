// Rotulos e tons de exibicao do console de suporte. Significado nunca so por cor: sempre texto.
// Primitivo LOCAL (modulo nunca importa modulo).
import type { StatusChamado } from '@/shared/contracts/_generated/suporte'

export type TomBadge = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro'

export const ROTULO_STATUS: Record<StatusChamado, string> = {
  aberto: 'Aberto',
  respondido: 'Respondido',
  resolvido: 'Resolvido',
}

export const TOM_STATUS: Record<StatusChamado, TomBadge> = {
  aberto: 'atencao',
  respondido: 'marca',
  resolvido: 'sucesso',
}

/** Rotulos do filtro de status da fila (inclui "todas"). */
export type FiltroStatus = 'todas' | StatusChamado

export const ROTULO_FILTRO: Record<FiltroStatus, string> = {
  todas: 'Todos',
  aberto: 'Abertos',
  respondido: 'Respondidos',
  resolvido: 'Resolvidos',
}

export const FILTROS_ORDEM: ReadonlyArray<FiltroStatus> = ['todas', 'aberto', 'respondido', 'resolvido']
