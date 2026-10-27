import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

/** Todas as datas de negócio do whaviso vivem neste fuso. */
export const TZ = 'America/Sao_Paulo'

/**
 * Constrói o instante (Date puro, em UTC) correspondente a data+hora em America/Sao_Paulo.
 * Retorna Date nativo (não TZDate) para serializar como UTC no pg e em toISOString().
 */
function instanteSp(dataIso: string, hora: number, minuto: number, seg = 0, ms = 0): Date {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  return new Date(new TZDate(ano!, mes! - 1, dia!, hora, minuto, seg, ms, TZ).getTime())
}

/**
 * Instante (UTC) de um dia de negócio (SP) num dado SEGUNDO do dia (0..86399). Construído
 * em segundos para nunca deslocar o dia civil (o dia é fixo; só o segundo dentro dele varia).
 */
export function instanteNoSegundoSp(dataIso: string, segundoDoDia: number): Date {
  return instanteSp(dataIso, 0, 0, segundoDoDia)
}

/** 'YYYY-MM-DD' do dia atual em America/Sao_Paulo. */
export function hojeSp(agora: Date = new Date()): string {
  return format(new TZDate(agora.getTime(), TZ), 'yyyy-MM-dd')
}

/** Instante UTC de 23:59:59.999 (SP) de um dia de negócio. */
export function fimDoDiaSp(dataIso: string): Date {
  return instanteSp(dataIso, 23, 59, 59, 999)
}

/** Formata data de negócio para exibição nas mensagens (dd/MM/yyyy). */
export function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Formata centavos como "R$ 1.234,56" (sem Intl para ser determinístico). */
export function formatarValorBr(centavos: number): string {
  const reais = Math.trunc(centavos / 100)
  const resto = Math.abs(centavos % 100).toString().padStart(2, '0')
  const inteiro = reais.toLocaleString('pt-BR')
  return `R$ ${inteiro},${resto}`
}
