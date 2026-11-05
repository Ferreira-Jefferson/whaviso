// Rotulos e tons de exibicao do suporte. Significado nunca so por cor: sempre texto.
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
