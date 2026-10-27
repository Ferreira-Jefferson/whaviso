// Normalizacao do periodo: datas de negocio (America/Sao_Paulo, `ate` inclusivo) -> intervalo
// UTC semiaberto [inicio, fim). Puro e testavel.
import { hojeSp, instanteNoSegundoSp } from '@whaviso/shared/datas'

export const MAX_DIAS = 366
export const DEFAULT_DIAS = 30

export interface Periodo {
  de: string
  ate: string
  inicio: Date
  fim: Date
}

export class PeriodoInvalido extends Error {}

const DIA_MS = 86_400_000

function somarDias(dataIso: string, dias: number): string {
  const [a, m, d] = dataIso.split('-').map(Number)
  return new Date(Date.UTC(a!, m! - 1, d! + dias)).toISOString().slice(0, 10)
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS) + 1
}

/** Default: `ate` = hoje (SP); `de` = ate - 29 dias. Lanca PeriodoInvalido se de > ate ou > 366 dias. */
export function normalizarPeriodo(de?: string, ate?: string, agora: Date = new Date()): Periodo {
  const fimNeg = ate ?? hojeSp(agora)
  const iniNeg = de ?? somarDias(fimNeg, -(DEFAULT_DIAS - 1))
  const dias = diasEntre(iniNeg, fimNeg)
  if (dias < 1) throw new PeriodoInvalido('"de" deve ser anterior ou igual a "ate"')
  if (dias > MAX_DIAS) throw new PeriodoInvalido(`Periodo maximo de ${MAX_DIAS} dias`)
  return {
    de: iniNeg,
    ate: fimNeg,
    inicio: instanteNoSegundoSp(iniNeg, 0),
    fim: instanteNoSegundoSp(somarDias(fimNeg, 1), 0),
  }
}
