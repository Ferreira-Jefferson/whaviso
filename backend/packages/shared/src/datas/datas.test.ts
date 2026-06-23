import { describe, expect, it } from 'vitest'
import {
  aceiteExpiraEm,
  calcularAgendamentos,
  diaDaEtapa,
  fimDoDiaSp,
  formatarValorBr,
  hojeSp,
  janelaPerdida,
} from './index'

// São Paulo é UTC-3 o ano inteiro (sem horário de verão desde 2019):
// 09:00 SP == 12:00 UTC.
const D = '2026-07-15' // data combinada de referência

describe('diaDaEtapa', () => {
  it('calcula os 4 dias do ciclo', () => {
    expect(diaDaEtapa(D, 'd_menos_2')).toBe('2026-07-13')
    expect(diaDaEtapa(D, 'd_menos_1')).toBe('2026-07-14')
    expect(diaDaEtapa(D, 'd')).toBe('2026-07-15')
    expect(diaDaEtapa(D, 'd_mais_1')).toBe('2026-07-16')
  })

  it('atravessa fronteira de mês', () => {
    expect(diaDaEtapa('2026-08-01', 'd_menos_2')).toBe('2026-07-30')
    expect(diaDaEtapa('2026-07-31', 'd_mais_1')).toBe('2026-08-01')
  })
})

describe('calcularAgendamentos', () => {
  const SEG_9H = 9 * 3600 // 09:00:00 SP = 12:00 UTC (referência das asserções)

  it('aceite cedo: 4 envios no horário reservado (09:00 SP = 12:00 UTC)', () => {
    const agora = new Date('2026-07-10T15:00:00Z')
    const ags = calcularAgendamentos(D, SEG_9H, agora)
    expect(ags.map((a) => a.etapa)).toEqual(['d_menos_2', 'd_menos_1', 'd', 'd_mais_1'])
    expect(ags[0]!.agendado_para.toISOString()).toBe('2026-07-13T12:00:00.000Z')
    expect(ags[3]!.agendado_para.toISOString()).toBe('2026-07-16T12:00:00.000Z')
  })

  it('todas as etapas saem no MESMO segundo reservado, cada uma na sua data (H6.9)', () => {
    const seg = 10 * 3600 + 30 * 60 + 7 // 10:30:07 SP = 13:30:07 UTC
    const ags = calcularAgendamentos(D, seg, new Date('2026-07-10T00:00:00Z'))
    expect(ags.map((a) => a.agendado_para.toISOString())).toEqual([
      '2026-07-13T13:30:07.000Z',
      '2026-07-14T13:30:07.000Z',
      '2026-07-15T13:30:07.000Z',
      '2026-07-16T13:30:07.000Z',
    ])
  })

  it('aceite tardio no dia de D-1 após o horário: D-2 cai fora, D-1 ainda sai hoje', () => {
    const agora = new Date('2026-07-14T17:00:00Z') // 14:00 SP do dia D-1, depois das 09:00
    const ags = calcularAgendamentos(D, SEG_9H, agora)
    expect(ags.map((a) => a.etapa)).toEqual(['d_menos_1', 'd', 'd_mais_1'])
    // D-1 é hoje e o segundo reservado (09:00) já passou: agenda no instante reservado de
    // hoje (claim imediato pelo scheduler), não em lote atrasado.
    expect(ags[0]!.agendado_para.toISOString()).toBe('2026-07-14T12:00:00.000Z')
    expect(ags[1]!.agendado_para.toISOString()).toBe('2026-07-15T12:00:00.000Z')
  })

  it('aceite no dia D antes do horário: todas a partir de D no horário reservado', () => {
    const agora = new Date('2026-07-15T10:00:00Z') // 07:00 SP do dia D
    const ags = calcularAgendamentos(D, SEG_9H, agora)
    expect(ags.map((a) => a.etapa)).toEqual(['d', 'd_mais_1'])
    expect(ags[0]!.agendado_para.toISOString()).toBe('2026-07-15T12:00:00.000Z')
  })

  it('aceite depois do fim de D+1: nenhum envio', () => {
    const agora = new Date('2026-07-17T15:00:00Z')
    expect(calcularAgendamentos(D, SEG_9H, agora)).toEqual([])
  })
})

describe('janelas e expiração', () => {
  it('janelaPerdida vira true depois de 23:59:59.999 SP do dia da etapa', () => {
    // fim do dia 13/07 SP = 02:59:59.999Z de 14/07
    expect(janelaPerdida(D, 'd_menos_2', new Date('2026-07-14T02:00:00Z'))).toBe(false)
    expect(janelaPerdida(D, 'd_menos_2', new Date('2026-07-14T03:00:00Z'))).toBe(true)
  })

  it('aceiteExpiraEm = fim do dia (SP) de D+1', () => {
    expect(aceiteExpiraEm(D).toISOString()).toBe('2026-07-17T02:59:59.999Z')
  })

  it('fimDoDiaSp e hojeSp são coerentes', () => {
    const fim = fimDoDiaSp('2026-07-15')
    expect(hojeSp(fim)).toBe('2026-07-15')
    expect(hojeSp(new Date(fim.getTime() + 1))).toBe('2026-07-16')
  })
})

describe('formatarValorBr', () => {
  it('formata centavos', () => {
    expect(formatarValorBr(990)).toBe('R$ 9,90')
    expect(formatarValorBr(123456)).toBe('R$ 1.234,56')
    expect(formatarValorBr(100)).toBe('R$ 1,00')
  })
})
