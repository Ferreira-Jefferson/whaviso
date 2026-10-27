// Rotulos, tons e utilitarios de data da cobranca. Datas de negocio ('YYYY-MM-DD') sao exibidas
// sem conversao de fuso (a virada de mes e o vencimento sao calculados no servidor).
import type { StatusAssinatura, StatusFatura } from '@/shared/contracts/_generated/plataforma_cobranca'
import { hojeIso } from '@/shared/format'

export type TomBadge = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro'

export const ROTULO_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  trial: 'Em teste',
  ativa: 'Ativa',
  suspensa: 'Suspensa',
  cancelada: 'Cancelada',
}

export const TOM_STATUS_ASSINATURA: Record<StatusAssinatura, TomBadge> = {
  trial: 'marca',
  ativa: 'sucesso',
  suspensa: 'atencao',
  cancelada: 'erro',
}

export const ROTULO_STATUS_FATURA: Record<StatusFatura, string> = {
  aberta: 'Em aberto',
  paga: 'Paga',
  atrasada: 'Atrasada',
  cancelada: 'Cancelada',
}

export const TOM_STATUS_FATURA: Record<StatusFatura, TomBadge> = {
  aberta: 'marca',
  paga: 'sucesso',
  atrasada: 'erro',
  cancelada: 'neutro',
}

/** Transicoes validas de assinatura (espelho da regra do servidor; o servidor e quem decide, 409). */
export const TRANSICOES: Record<StatusAssinatura, ReadonlyArray<StatusAssinatura>> = {
  trial: ['ativa', 'cancelada'],
  ativa: ['suspensa', 'cancelada'],
  suspensa: ['ativa', 'cancelada'],
  cancelada: [],
}

/** Verbo de acao por status de destino. */
export const ACAO_TRANSICAO: Record<StatusAssinatura, string> = {
  trial: 'Voltar para teste',
  ativa: 'Ativar',
  suspensa: 'Suspender',
  cancelada: 'Cancelar assinatura',
}

/** Fatura que ainda aceita baixa ou cancelamento. */
export function faturaPendente(status: StatusFatura): boolean {
  return status === 'aberta' || status === 'atrasada'
}

/** 'YYYY-MM-DD' -> 'dd/MM/yyyy', sem passar por Date (nada de deslocamento de fuso). */
export function dataNegocio(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const

/** Competencia 'YYYY-MM-01' -> 'março de 2026'. */
export function competenciaLonga(iso: string): string {
  const [a, m] = iso.split('-')
  return `${MESES[Number(m) - 1] ?? m} de ${a}`
}

/** Ultimos `n` meses (do corrente para tras) como competencias 'YYYY-MM-01', mes corrente em Sao Paulo. */
export function ultimasCompetencias(n: number): string[] {
  const [a, m] = hojeIso().split('-').map(Number) as [number, number]
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const idx = a * 12 + (m - 1) - i
    const ano = Math.floor(idx / 12)
    const mes = (idx % 12) + 1
    out.push(`${ano}-${String(mes).padStart(2, '0')}-01`)
  }
  return out
}

export function idCurto(id: string): string {
  return id.slice(0, 8)
}
