// Funcoes puras de horario (sem I/O). America/Sao_Paulo nomeado (nunca offset fixo).
import { TZ } from '@whaviso/shared/datas'

export interface FaixaBase {
  abre: string
  fecha: string
}
export interface DiaBase {
  dia: number
  fechado: boolean
  faixas: FaixaBase[]
}
export interface HorariosBase {
  dias: DiaBase[]
}

export function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** Faixa em minutos desde 00:00 do dia de abertura; fecha pode passar de 1440 (cruza meia-noite). */
function intervalo(f: FaixaBase): [number, number] {
  const a = paraMinutos(f.abre)
  const c = paraMinutos(f.fecha)
  return [a, c > a ? c : c + 1440]
}
// A deteccao de sobreposicao de faixas (`faixasSobrepostas`) vive no contrato
// @whaviso/shared/contracts (lojas.ts), onde alimenta o refinement de `Horarios` e e
// reemitida para o front. Aqui ficam so os calculos que dependem do fuso (aberta agora).

const FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Dia da semana (0 = domingo) e minuto do dia em America/Sao_Paulo. */
export function diaEMinutoSp(agora: Date): { dia: number; minuto: number } {
  const p = Object.fromEntries(FMT.formatToParts(agora).map((x) => [x.type, x.value]))
  return { dia: DIAS[p['weekday'] ?? ''] ?? 0, minuto: Number(p['hour']) * 60 + Number(p['minute']) }
}

/** Aberta agora? null quando a loja nao tem horarios cadastrados (calculado no servidor). */
export function lojaAbertaAgora(
  horarios: HorariosBase | null,
  agora: Date = new Date(),
): boolean | null {
  if (!horarios) return null
  const { dia, minuto } = diaEMinutoSp(agora)
  const hoje = horarios.dias.find((d) => d.dia === dia)
  const ontem = horarios.dias.find((d) => d.dia === (dia + 6) % 7)
  if (hoje && !hoje.fechado) {
    for (const f of hoje.faixas) {
      const [a, c] = intervalo(f)
      if (minuto >= a && minuto < c) return true
    }
  }
  if (ontem && !ontem.fechado) {
    for (const f of ontem.faixas) {
      const [, c] = intervalo(f)
      if (minuto < c - 1440) return true
    }
  }
  return false
}
