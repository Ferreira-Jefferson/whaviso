// Rotulos e tons de status e segmento de campanha.
import type { CampanhaSegmento, CampanhaStatus } from './api'

export const ROTULO_STATUS: Record<CampanhaStatus, string> = {
  rascunho: 'Rascunho',
  enfileirada: 'Disparada',
  cancelada: 'Cancelada',
}

export const TOM_STATUS: Record<CampanhaStatus, 'neutro' | 'sucesso' | 'erro'> = {
  rascunho: 'neutro',
  enfileirada: 'sucesso',
  cancelada: 'erro',
}

export const SEGMENTOS: ReadonlyArray<CampanhaSegmento> = [
  'campeao',
  'fiel',
  'novo',
  'ocasional',
  'em_risco',
  'perdido',
  'sem_pedido',
]

export const ROTULO_SEGMENTO: Record<CampanhaSegmento, string> = {
  campeao: 'Campeões',
  fiel: 'Fiéis',
  novo: 'Novos',
  ocasional: 'Ocasionais',
  em_risco: 'Em risco',
  perdido: 'Perdidos',
  sem_pedido: 'Sem pedido',
}

export function rotuloPublico(segmento: CampanhaSegmento | null | undefined): string {
  return segmento ? ROTULO_SEGMENTO[segmento] : 'Todos que podem receber'
}
