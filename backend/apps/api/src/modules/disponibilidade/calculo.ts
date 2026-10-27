// Funcoes puras de disponibilidade (sem I/O). America/Sao_Paulo e nomeado (nunca offset fixo):
// o estado "aceitando agora" e "atendente pode responder" sao SEMPRE derivados, nunca persistidos.
import { TZ } from '@whaviso/shared/datas'

export interface FaixaHorario {
  dia_semana: number
  abre: string // "HH:mm"
  fecha: string // "HH:mm"
}
export interface Excecao {
  data: string // "YYYY-MM-DD"
  fechado: boolean
  abre: string | null
  fecha: string | null
}
export interface JanelaAtendente {
  inicio: string // "HH:mm"
  fim: string // "HH:mm"
  dias: number[]
  ativo: boolean
}
export interface DadosDisponibilidade {
  horarios: FaixaHorario[]
  excecoes: Excecao[]
}

export function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** Intervalo em minutos; se fecha <= abre a faixa cruza a meia-noite (fecha vira +1440). */
function intervalo(abre: string, fecha: string): [number, number] {
  const a = paraMinutos(abre)
  const c = paraMinutos(fecha)
  return [a, c > a ? c : c + 1440]
}

/** Duas faixas HH:mm se sobrepoem? Considera faixas que cruzam a meia-noite (wrap). */
export function faixasSobrepoem(
  a: { abre: string; fecha: string },
  b: { abre: string; fecha: string },
): boolean {
  const [a1, c1] = intervalo(a.abre, a.fecha)
  const [a2, c2] = intervalo(b.abre, b.fecha)
  const hit = (x1: number, y1: number, x2: number, y2: number) => x1 < y2 && x2 < y1
  return (
    hit(a1, c1, a2, c2) ||
    hit(a1, c1, a2 - 1440, c2 - 1440) ||
    hit(a1 - 1440, c1 - 1440, a2, c2)
  )
}

function dentro(minuto: number, abre: string, fecha: string): boolean {
  const [a, c] = intervalo(abre, fecha)
  // Faixa que cruza a meia-noite tambem vale no inicio do dia (minuto + 1440).
  return (minuto >= a && minuto < c) || (minuto + 1440 >= a && minuto + 1440 < c)
}

/** Faixa cadastrada NO PROPRIO dia cobre o minuto (se cruza a meia-noite, cobre [abre, 24h)). */
function cobreNoDia(minuto: number, abre: string, fecha: string): boolean {
  const a = paraMinutos(abre)
  const c = paraMinutos(fecha)
  return c > a ? minuto >= a && minuto < c : minuto >= a
}

/** Faixa do dia ANTERIOR que cruza a meia-noite transborda em [0, fecha) do dia de hoje. */
function transbordaDaVespera(minuto: number, abre: string, fecha: string): boolean {
  const a = paraMinutos(abre)
  const c = paraMinutos(fecha)
  return c <= a && minuto < c
}

const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Momento civil em America/Sao_Paulo: data YYYY-MM-DD, dia da semana (0=dom) e minuto do dia. */
export function momentoSp(agora: Date): { data: string; dia: number; minuto: number } {
  const p = Object.fromEntries(FMT.formatToParts(agora).map((x) => [x.type, x.value]))
  return {
    data: `${p['year']}-${p['month']}-${p['day']}`,
    dia: DIAS[p['weekday'] ?? ''] ?? 0,
    minuto: Number(p['hour']) * 60 + Number(p['minute']),
  }
}

/**
 * A loja aceita pedidos AGORA? Excecao ativa da data de hoje vence os horarios:
 * fechada = nao aceita; aberta = vale a faixa da excecao. Sem excecao, vale o horario do dia.
 */
export function lojaAceitandoAgora(dados: DadosDisponibilidade, agora: Date = new Date()): boolean {
  const { data, dia, minuto } = momentoSp(agora)
  const excecao = dados.excecoes.find((e) => e.data === data)
  if (excecao) {
    if (excecao.fechado || !excecao.abre || !excecao.fecha) return false
    return cobreNoDia(minuto, excecao.abre, excecao.fecha)
  }
  const vespera = (dia + 6) % 7
  return dados.horarios.some(
    (f) =>
      (f.dia_semana === dia && cobreNoDia(minuto, f.abre, f.fecha)) ||
      (f.dia_semana === vespera && transbordaDaVespera(minuto, f.abre, f.fecha)),
  )
}

/** O atendente (IA) pode responder AGORA? Fora da janela (ou janela inativa/ausente) = nao. */
export function atendentePodeResponder(
  janela: JanelaAtendente | null,
  agora: Date = new Date(),
): boolean {
  if (!janela || !janela.ativo) return false
  const { dia, minuto } = momentoSp(agora)
  if (!janela.dias.includes(dia)) return false
  return dentro(minuto, janela.inicio, janela.fim)
}
