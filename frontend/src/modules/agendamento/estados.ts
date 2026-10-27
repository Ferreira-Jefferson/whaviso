// Rotulos da agenda e conversao de horario. O instante e absoluto (ISO UTC no servidor); a loja
// le e digita em America/Sao_Paulo (sem horario de verao desde 2019, offset fixo -03:00).
import { diaSaoPaulo, formatarHora } from '@/shared/format'
import type { JanelaAgendamentoValor } from '@/shared/contracts/_generated/agendamento'

export const ROTULO_JANELA: Record<JanelaAgendamentoValor, string> = {
  futuro: 'Futuro',
  liberar: 'Liberar agora',
  atrasado: 'Atrasado',
}

export const TOM_JANELA: Record<JanelaAgendamentoValor, 'neutro' | 'atencao' | 'erro'> = {
  futuro: 'neutro',
  liberar: 'atencao',
  atrasado: 'erro',
}

export const ROTULO_MODALIDADE = { entrega: 'Entrega', retirada: 'Retirada' } as const

export const OPCOES_ANTECEDENCIA = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hora' },
  { value: '120', label: '2 horas' },
  { value: '240', label: '4 horas' },
] as const

/** ISO -> valor de <input type="datetime-local"> ("yyyy-MM-ddTHH:mm") em Sao Paulo. */
export function isoParaCampo(iso: string): string {
  return `${diaSaoPaulo(iso)}T${formatarHora(iso)}`
}

/** Valor de <input type="datetime-local"> (Sao Paulo) -> ISO com offset, aceito pela api. */
export function campoParaIso(valor: string): string {
  return `${valor}:00-03:00`
}

/** Menor valor aceito no campo: agora, em Sao Paulo (a api recusa instante no passado). */
export function agoraComoCampo(): string {
  return isoParaCampo(new Date().toISOString())
}
