// Selo do segmento RFM. O significado nunca depende so da cor: sempre leva o texto.
import { Badge } from '@/shared/ui'
import type { CrmSegmento } from '../api'
import { ROTULO_SEGMENTO_UNICO, TOM_SEGMENTO } from '../segmentos'

export function SeloSegmento({ segmento }: { segmento: CrmSegmento }) {
  return <Badge tom={TOM_SEGMENTO[segmento]}>{ROTULO_SEGMENTO_UNICO[segmento]}</Badge>
}
