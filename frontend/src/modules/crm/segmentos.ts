// Rotulos, tons e explicacoes dos segmentos RFM (regras: backend/apps/api/src/modules/crm/MODULE.md).
import type { CrmSegmento } from './api'

export type TomSegmento = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro'

export const SEGMENTOS: ReadonlyArray<CrmSegmento> = [
  'campeao',
  'fiel',
  'novo',
  'ocasional',
  'em_risco',
  'perdido',
  'sem_pedido',
]

export const ROTULO_SEGMENTO: Record<CrmSegmento, string> = {
  campeao: 'Campeões',
  fiel: 'Fiéis',
  novo: 'Novos',
  ocasional: 'Ocasionais',
  em_risco: 'Em risco',
  perdido: 'Perdidos',
  sem_pedido: 'Sem pedido',
}

export const ROTULO_SEGMENTO_UNICO: Record<CrmSegmento, string> = {
  campeao: 'Campeão',
  fiel: 'Fiel',
  novo: 'Novo',
  ocasional: 'Ocasional',
  em_risco: 'Em risco',
  perdido: 'Perdido',
  sem_pedido: 'Sem pedido',
}

export const TOM_SEGMENTO: Record<CrmSegmento, TomSegmento> = {
  campeao: 'sucesso',
  fiel: 'marca',
  novo: 'marca',
  ocasional: 'neutro',
  em_risco: 'atencao',
  perdido: 'erro',
  sem_pedido: 'neutro',
}

export const DICA_SEGMENTO: Record<CrmSegmento, string> = {
  campeao: 'Compram com frequência e voltaram há pouco tempo.',
  fiel: 'Pedem com regularidade e estiveram por aqui recentemente.',
  novo: 'Fizeram o primeiro pedido há pouco tempo.',
  ocasional: 'Pedem de vez em quando.',
  em_risco: 'Pediam bastante, mas estão sumindo. Vale uma campanha.',
  perdido: 'Não pedem há muito tempo.',
  sem_pedido: 'Ainda não concluíram nenhum pedido.',
}
