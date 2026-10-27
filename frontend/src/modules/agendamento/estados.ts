// Rotulos da agenda e conversao de horario. O instante e absoluto (ISO UTC no servidor); a loja
// le e digita em America/Sao_Paulo (sem horario de verao desde 2019, offset fixo -03:00).
import { diaSaoPaulo, formatarData, formatarHora } from '@/shared/format'
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

/** Cor da borda-guia (faixa à esquerda da linha) por janela, para varrer a lista num relance. */
export const BORDA_JANELA: Record<JanelaAgendamentoValor, string> = {
  futuro: 'border-l-salvia',
  liberar: 'border-l-ambar',
  atrasado: 'border-l-barro',
}

/** Cor do horário em destaque por janela: o estado se lê no próprio número, não só no selo. */
export const COR_HORA_JANELA: Record<JanelaAgendamentoValor, string> = {
  futuro: 'text-salvia',
  liberar: 'text-ambar',
  atrasado: 'text-barro',
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

/** Maior valor aceito no campo: 30 dias a partir de agora, em Sao Paulo (espelha a regra da api). */
export function limiteCampo(): string {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  return isoParaCampo(d.toISOString())
}

/**
 * Rotulo de dia amigavel para a agenda: "Hoje" / "Amanha" quando for o caso, senao "dd/MM/yyyy".
 * Compara dias de negocio em Sao Paulo (offset fixo -03:00 desde 2019, sem horario de verao).
 */
export function rotuloDia(iso: string): string {
  const diaAlvo = diaSaoPaulo(iso)
  const agora = Date.now()
  if (diaAlvo === diaSaoPaulo(new Date(agora).toISOString())) return 'Hoje'
  if (diaAlvo === diaSaoPaulo(new Date(agora + 24 * 60 * 60 * 1000).toISOString())) return 'Amanhã'
  return formatarData(iso)
}
