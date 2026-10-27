// Rotulos e situacao de exibicao das promocoes. A situacao e so ROTULO de lista (derivada dos campos
// que o backend devolve); quem decide se um cupom vale e o backend em /validar e /aplicar.
import { diaSaoPaulo, formatarHora } from '@/shared/format'
import type { Promocao, PromocaoMotivo, PromocaoTipo } from './api'

export const TIPOS: ReadonlyArray<PromocaoTipo> = ['cupom_percentual', 'cupom_fixo', 'combo']

export const ROTULO_TIPO: Record<PromocaoTipo, string> = {
  cupom_percentual: 'Cupom percentual',
  cupom_fixo: 'Cupom de valor fixo',
  combo: 'Combo',
}

export const ROTULO_MOTIVO: Record<PromocaoMotivo, string> = {
  cupom_inexistente: 'Esse código não existe.',
  cupom_inativo: 'O cupom está desligado.',
  cupom_nao_iniciado: 'O cupom ainda não começou a valer.',
  cupom_expirado: 'O cupom já expirou.',
  cupom_esgotado: 'O limite total de usos do cupom foi atingido.',
  cupom_cliente_esgotado: 'Este cliente já usou o cupom o máximo de vezes.',
  pedido_abaixo_minimo: 'O pedido está abaixo do valor mínimo do cupom.',
  combo_incompleto: 'O pedido não tem todos os itens do combo.',
}

export type Situacao = 'vigente' | 'agendada' | 'expirada' | 'esgotada' | 'desligada'

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  vigente: 'Vigente',
  agendada: 'Agendada',
  expirada: 'Expirada',
  esgotada: 'Esgotada',
  desligada: 'Desligada',
}

export const TOM_SITUACAO: Record<Situacao, 'sucesso' | 'marca' | 'neutro' | 'atencao'> = {
  vigente: 'sucesso',
  agendada: 'marca',
  expirada: 'neutro',
  esgotada: 'atencao',
  desligada: 'neutro',
}

export function situacaoDe(p: Promocao, agora: number = Date.now()): Situacao {
  if (!p.ativo) return 'desligada'
  if (p.fim_em && Date.parse(p.fim_em) <= agora) return 'expirada'
  if (p.inicio_em && Date.parse(p.inicio_em) > agora) return 'agendada'
  if (p.limite_total != null && p.usos_total >= p.limite_total) return 'esgotada'
  return 'vigente'
}

/** ISO (UTC ou com offset) -> valor de <input type="datetime-local"> em America/Sao_Paulo. */
export function isoParaCampo(iso: string | null): string {
  return iso ? `${diaSaoPaulo(iso)}T${formatarHora(iso)}` : ''
}

/**
 * Valor de <input type="datetime-local"> (horario de Sao Paulo) -> ISO com offset.
 * O Brasil nao tem horario de verao desde 2019, entao o offset de Sao Paulo e fixo em -03:00.
 */
export function campoParaIso(valor: string): string | null {
  return valor ? `${valor}:00-03:00` : null
}
