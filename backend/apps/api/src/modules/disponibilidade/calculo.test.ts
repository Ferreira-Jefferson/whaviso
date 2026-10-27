// Logica pura de disponibilidade (sem I/O): fuso America/Sao_Paulo, feriado, fora de horario,
// janela do atendente, faixa que cruza a meia-noite. Nenhuma conexao de banco.
import { describe, it, expect } from 'vitest'
import {
  atendentePodeResponder,
  faixasSobrepoem,
  lojaAceitandoAgora,
  momentoSp,
} from './calculo'

// 2026-10-27T15:00:00Z = 12:00 em America/Sao_Paulo (UTC-3).
const AGORA = new Date('2026-10-27T15:00:00Z')
const { dia: DIA, data: DATA, minuto: MINUTO } = momentoSp(AGORA)

describe('momentoSp', () => {
  it('converte para o dia civil e minuto em America/Sao_Paulo', () => {
    expect(MINUTO).toBe(12 * 60)
    expect(DATA).toBe('2026-10-27')
    expect(DIA).toBeGreaterThanOrEqual(0)
    expect(DIA).toBeLessThanOrEqual(6)
  })
})

describe('lojaAceitandoAgora', () => {
  const horarioAberto = [{ dia_semana: DIA, abre: '09:00', fecha: '18:00' }]

  it('dentro do horario do dia: aceita', () => {
    expect(lojaAceitandoAgora({ horarios: horarioAberto, excecoes: [] }, AGORA)).toBe(true)
  })

  it('fora do horario do dia: nao aceita', () => {
    const horarios = [{ dia_semana: DIA, abre: '13:00', fecha: '18:00' }]
    expect(lojaAceitandoAgora({ horarios, excecoes: [] }, AGORA)).toBe(false)
  })

  it('sem horario para o dia: nao aceita', () => {
    const outroDia = [{ dia_semana: (DIA + 1) % 7, abre: '00:00', fecha: '23:59' }]
    expect(lojaAceitandoAgora({ horarios: outroDia, excecoes: [] }, AGORA)).toBe(false)
  })

  it('feriado (excecao fechada) vence o horario aberto: nao aceita', () => {
    const excecoes = [{ data: DATA, fechado: true, abre: null, fecha: null }]
    expect(lojaAceitandoAgora({ horarios: horarioAberto, excecoes }, AGORA)).toBe(false)
  })

  it('excecao aberta com faixa propria vence o horario do dia', () => {
    const horarios = [{ dia_semana: DIA, abre: '13:00', fecha: '18:00' }] // fechada as 12:00
    const excecoes = [{ data: DATA, fechado: false, abre: '08:00', fecha: '14:00' }]
    expect(lojaAceitandoAgora({ horarios, excecoes }, AGORA)).toBe(true)
  })

  it('faixa que cruza a meia-noite vale na madrugada', () => {
    // 2026-10-27T04:00:00Z = 01:00 SP. Faixa 18:00->02:00 do dia anterior cobre 01:00.
    const madrugada = new Date('2026-10-27T04:00:00Z')
    const diaAnterior = (momentoSp(madrugada).dia + 6) % 7
    const horarios = [{ dia_semana: diaAnterior, abre: '18:00', fecha: '02:00' }]
    expect(lojaAceitandoAgora({ horarios, excecoes: [] }, madrugada)).toBe(true)
  })
})

describe('atendentePodeResponder', () => {
  it('dentro da janela (dia ativo + horario): pode', () => {
    const janela = { inicio: '08:00', fim: '20:00', dias: [DIA], ativo: true }
    expect(atendentePodeResponder(janela, AGORA)).toBe(true)
  })

  it('fora do horario da janela: nao pode', () => {
    const janela = { inicio: '14:00', fim: '20:00', dias: [DIA], ativo: true }
    expect(atendentePodeResponder(janela, AGORA)).toBe(false)
  })

  it('dia nao coberto pela janela: nao pode', () => {
    const janela = { inicio: '08:00', fim: '20:00', dias: [(DIA + 1) % 7], ativo: true }
    expect(atendentePodeResponder(janela, AGORA)).toBe(false)
  })

  it('janela inativa ou ausente: nao pode', () => {
    const janela = { inicio: '08:00', fim: '20:00', dias: [DIA], ativo: false }
    expect(atendentePodeResponder(janela, AGORA)).toBe(false)
    expect(atendentePodeResponder(null, AGORA)).toBe(false)
  })
})

describe('faixasSobrepoem', () => {
  it('detecta sobreposicao e aceita faixas adjacentes', () => {
    expect(faixasSobrepoem({ abre: '09:00', fecha: '12:00' }, { abre: '11:00', fecha: '15:00' })).toBe(true)
    expect(faixasSobrepoem({ abre: '09:00', fecha: '12:00' }, { abre: '12:00', fecha: '15:00' })).toBe(false)
    expect(faixasSobrepoem({ abre: '18:00', fecha: '02:00' }, { abre: '01:00', fecha: '03:00' })).toBe(true)
  })
})
