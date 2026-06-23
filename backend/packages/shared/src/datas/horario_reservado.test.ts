import { describe, expect, it } from 'vitest'
import {
  JANELA_INICIO_SEG,
  JANELA_FIM_SEG,
  DISTANCIA_MIN_SEG,
  alocarSegundo,
  segundoDoDiaSp,
  segundoDePartida,
} from './horario_reservado'
import { calcularAgendamentos } from './index'

describe('segundoDoDiaSp / segundoDePartida', () => {
  it('converte o instante para o segundo do dia em SP (UTC-3)', () => {
    // 12:00:00 UTC = 09:00:00 SP = 32400
    expect(segundoDoDiaSp(new Date('2026-07-15T12:00:00Z'))).toBe(9 * 3600)
    // 13:30:07 UTC = 10:30:07 SP
    expect(segundoDoDiaSp(new Date('2026-07-15T13:30:07Z'))).toBe(10 * 3600 + 30 * 60 + 7)
  })

  it('partida = segundo atual se na janela; senão início (08:00:00)', () => {
    // 10:00 SP (na janela)
    expect(segundoDePartida(new Date('2026-07-15T13:00:00Z'))).toBe(10 * 3600)
    // 05:00 SP (antes da janela) → 08:00:00
    expect(segundoDePartida(new Date('2026-07-15T08:00:00Z'))).toBe(JANELA_INICIO_SEG)
    // 22:00 SP (depois da janela) → 08:00:00
    expect(segundoDePartida(new Date('2026-07-16T01:00:00Z'))).toBe(JANELA_INICIO_SEG)
  })
})

describe('alocarSegundo (H6.9)', () => {
  const vazio = { ocupadosGlobais: new Set<number>(), ocupadosDevedor: [] as number[] }

  it('segundo atual livre → usa ele, espaçamento ideal', () => {
    const r = alocarSegundo({ partida: 40000, ...vazio })
    expect(r).toEqual({ seg: 40000, espacamentoIdeal: true })
  })

  it('segundo ocupado (global) → próximo livre avançando 1 a 1', () => {
    const r = alocarSegundo({
      partida: 40000,
      ocupadosGlobais: new Set([40000, 40001, 40002]),
      ocupadosDevedor: [],
    })
    expect(r.seg).toBe(40003)
    expect(r.espacamentoIdeal).toBe(true)
  })

  it('wrap: perto do fim da janela e ocupados até o fim → recomeça do 08:00:00', () => {
    // Partida no penúltimo segundo; os últimos 2 ocupados → deve dar a volta para o início.
    const ocup = new Set([JANELA_FIM_SEG - 1, JANELA_FIM_SEG])
    const r = alocarSegundo({ partida: JANELA_FIM_SEG - 1, ocupadosGlobais: ocup, ocupadosDevedor: [] })
    expect(r.seg).toBe(JANELA_INICIO_SEG)
  })

  it('respeita 10min por devedor: pula segundos a menos de 10min de outro aviso do devedor', () => {
    // Devedor já tem aviso às 40000; a janela [40000-599, 40000+599] é bloqueada p/ ELE.
    const r = alocarSegundo({
      partida: 40000,
      ocupadosGlobais: new Set([40000]),
      ocupadosDevedor: [40000],
    })
    // 40000 ocupado global; 40001..40599 dentro dos 10min do devedor → primeiro livre = 40600.
    expect(r.seg).toBe(40000 + DISTANCIA_MIN_SEG)
    expect(r.espacamentoIdeal).toBe(true)
  })

  it('fallback dos 10min: não cabe espaçamento → segundo só com unicidade global, espacamentoIdeal=false', () => {
    // O devedor "cerca" toda a janela com avisos espaçados de menos de 2*10min, de modo
    // que nenhum segundo fica a >=10min de todos eles, mas há segundos livres no global.
    const ocupadosDevedor: number[] = []
    for (let s = JANELA_INICIO_SEG; s <= JANELA_FIM_SEG; s += DISTANCIA_MIN_SEG) {
      ocupadosDevedor.push(s)
    }
    const r = alocarSegundo({
      partida: JANELA_INICIO_SEG,
      ocupadosGlobais: new Set(ocupadosDevedor), // os mesmos segundos ocupados globalmente
      ocupadosDevedor,
    })
    // Não há segundo a >=10min de todos os do devedor → relaxa, escolhe livre global.
    expect(r.espacamentoIdeal).toBe(false)
    expect(r.seg).toBeGreaterThanOrEqual(JANELA_INICIO_SEG)
    expect(r.seg).toBeLessThanOrEqual(JANELA_FIM_SEG)
    expect(new Set(ocupadosDevedor).has(r.seg)).toBe(false) // unicidade global mantida
  })

  it('janela inteira ocupada (global) → segundo aleatório, espacamentoIdeal=false', () => {
    const todos = new Set<number>()
    for (let s = JANELA_INICIO_SEG; s <= JANELA_FIM_SEG; s++) todos.add(s)
    const r = alocarSegundo({
      partida: JANELA_INICIO_SEG,
      ocupadosGlobais: todos,
      ocupadosDevedor: [],
      aleatorio: () => 0.5, // determinístico
    })
    expect(r.espacamentoIdeal).toBe(false)
    expect(r.seg).toBe(JANELA_INICIO_SEG + Math.floor(0.5 * 36000))
  })

  it('o segundo alocado está sempre na janela 08:00:00..17:59:59', () => {
    for (const partida of [JANELA_INICIO_SEG, 50000, JANELA_FIM_SEG]) {
      const r = alocarSegundo({ partida, ...vazio })
      expect(r.seg).toBeGreaterThanOrEqual(JANELA_INICIO_SEG)
      expect(r.seg).toBeLessThanOrEqual(JANELA_FIM_SEG)
    }
  })
})

describe('DST não desloca o dia civil (robustez)', () => {
  it('D-2 cai sempre 2 dias antes no calendário local, mesmo em torno de viradas de fuso', () => {
    // Datas em torno de uma virada de horário de verão genérica (Brasil não usa hoje, mas
    // o cálculo é por dia civil em SP, então o offset não muda o dia).
    const seg = 10 * 3600 // 10:00 SP
    const ags = calcularAgendamentos('2026-02-15', seg, new Date('2026-01-01T00:00:00Z'))
    // D-2 = 13/02, D+1 = 16/02 (dias civis), independente de qualquer DST.
    expect(ags[0]!.etapa).toBe('d_menos_2')
    expect(ags[0]!.agendado_para.toISOString().slice(0, 10)).toBe('2026-02-13')
    expect(ags[3]!.agendado_para.toISOString().slice(0, 10)).toBe('2026-02-16')
  })
})
