// Regras puras do modulo plataforma_cobranca: SEM I/O, SEM acesso HTTP nem banco. Tudo o que
// depende de data de negocio (competencia, vencimento, atraso) e calculado aqui, em cima de
// strings 'YYYY-MM-DD' no calendario civil de America/Sao_Paulo (o chamador passa `hoje` ja
// resolvido no fuso via @whaviso/shared/datas). Dinheiro nao aparece aqui; valor vive nos DTOs.
import type { StatusAssinatura, StatusFatura } from '@whaviso/shared/contracts'

/** Carencia padrao (dias corridos apos o vencimento) antes de suspender. Config, nao tabela. */
export const CARENCIA_DIAS_PADRAO = 7

/** Partes de uma data 'YYYY-MM-DD' (civil, sem fuso). */
function partes(dataIso: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  return { ano: ano!, mes: mes!, dia: dia! }
}

function doisDigitos(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Primeiro dia do mes de `dataIso` -> 'YYYY-MM-01' (a competencia daquele dia). */
export function mesCompetenciaDe(dataIso: string): string {
  const { ano, mes } = partes(dataIso)
  return `${ano}-${doisDigitos(mes)}-01`
}

/** Competencia do mes seguinte: 'YYYY-MM-01' -> proximo 'YYYY-MM-01' (vira o ano em dezembro). */
export function proximaCompetencia(competenciaIso: string): string {
  const { ano, mes } = partes(competenciaIso)
  const proxMes = mes === 12 ? 1 : mes + 1
  const proxAno = mes === 12 ? ano + 1 : ano
  return `${proxAno}-${doisDigitos(proxMes)}-01`
}

/**
 * Vencimento da fatura de uma competencia: o dia `dia` (1..28) daquele mes. Como o dia e <= 28,
 * existe em todo mes (inclusive fevereiro), sem overflow nem ajuste.
 */
export function calcularVencimento(dia: number, competenciaIso: string): string {
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
    throw new Error(`dia de vencimento invalido: ${dia} (esperado 1..28)`)
  }
  const { ano, mes } = partes(competenciaIso)
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`
}

/** Dias corridos entre duas datas civis (b - a). Usa UTC para nao sofrer com horario de verao. */
export function diasEntre(aIso: string, bIso: string): number {
  const a = partes(aIso)
  const b = partes(bIso)
  const ta = Date.UTC(a.ano, a.mes - 1, a.dia)
  const tb = Date.UTC(b.ano, b.mes - 1, b.dia)
  return Math.round((tb - ta) / 86_400_000)
}

/**
 * Classifica uma fatura na data `hoje`: uma 'aberta' com vencimento ANTES de hoje vira 'atrasada'.
 * Qualquer outro status (paga, cancelada, ja atrasada) permanece. Funcao pura e idempotente.
 */
export function classificarFatura(
  hojeIso: string,
  vencimentoIso: string,
  status: StatusFatura,
): StatusFatura {
  if (status === 'aberta' && diasEntre(vencimentoIso, hojeIso) > 0) return 'atrasada'
  return status
}

/** Fatura vista pela decisao de suspensao (so o que importa: status e vencimento). */
export interface FaturaParaSuspensao {
  status: StatusFatura
  vencimento: string
}

/**
 * Decide se a assinatura deve ser suspensa: existe ao menos uma fatura 'atrasada' cujo atraso
 * (hoje - vencimento) passou da carencia. Pura; o chamador resolve `hoje` no fuso de negocio.
 */
export function deveSuspender(
  faturas: readonly FaturaParaSuspensao[],
  carenciaDias: number,
  hojeIso: string,
): boolean {
  return faturas.some(
    (f) => f.status === 'atrasada' && diasEntre(f.vencimento, hojeIso) > carenciaDias,
  )
}

/**
 * Tabela de transicoes validas do status da assinatura. 'cancelada' e terminal. Transicao para
 * o mesmo status NAO e valida (nao ha o que mudar). Fonte unica, testada em regras.test.ts.
 */
export const TRANSICOES_ASSINATURA: Readonly<Record<StatusAssinatura, readonly StatusAssinatura[]>> = {
  trial: ['ativa', 'cancelada'],
  ativa: ['suspensa', 'cancelada'],
  suspensa: ['ativa', 'cancelada'],
  cancelada: [],
}

/** true se a transicao `de -> para` e permitida pela tabela. */
export function transicaoValida(de: StatusAssinatura, para: StatusAssinatura): boolean {
  return TRANSICOES_ASSINATURA[de].includes(para)
}
