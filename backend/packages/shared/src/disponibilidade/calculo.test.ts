import { describe, expect, it } from 'vitest'
import {
  modoAtendente,
  dentroAgendamento,
  faixasSobrepoem,
  lojaAceitandoAgora,
  momentoSp,
  type DadosDisponibilidade,
  type Agendamento,
} from './calculo'

// 12:00 em America/Sao_Paulo (UTC-3).
const agora = new Date('2026-10-28T15:00:00.000Z')
const { dia, data: DATA, minuto: MINUTO } = momentoSp(agora)

const abertoHoje: DadosDisponibilidade = {
  horarios: [{ dia_semana: dia, abre: '00:00', fecha: '23:59' }],
  excecoes: [],
}
const fechado: DadosDisponibilidade = { horarios: [], excecoes: [] }

const desligado: Agendamento = { modo: 'desligado', dias: [], inicio: '00:00', fim: '00:00' }
const vinteQuatro: Agendamento = { modo: '24h', dias: [], inicio: '00:00', fim: '00:00' }
const faixaAgora: Agendamento = { modo: 'faixa', dias: [dia], inicio: '00:00', fim: '23:59' }
const faixaOutroDia: Agendamento = { modo: 'faixa', dias: [(dia + 1) % 7], inicio: '00:00', fim: '23:59' }

describe('modoAtendente (fonte unica da loja)', () => {
  it('aceitando pedido ao vivo vence tudo -> atendimento', () => {
    expect(modoAtendente(abertoHoje, vinteQuatro, agora)).toBe('atendimento')
    expect(modoAtendente(abertoHoje, desligado, agora)).toBe('atendimento')
  })
  it('fora do atendimento, com agendamento 24h -> agendamento', () => {
    expect(modoAtendente(fechado, vinteQuatro, agora)).toBe('agendamento')
  })
  it('fora do atendimento, agendamento desligado -> fechado', () => {
    expect(modoAtendente(fechado, desligado, agora)).toBe('fechado')
  })
  it('fora do atendimento, faixa de agendamento cobrindo agora -> agendamento', () => {
    expect(modoAtendente(fechado, faixaAgora, agora)).toBe('agendamento')
  })
  it('fora do atendimento, faixa de agendamento em outro dia -> fechado', () => {
    expect(modoAtendente(fechado, faixaOutroDia, agora)).toBe('fechado')
  })
})

describe('dentroAgendamento', () => {
  it('desligado nunca aceita', () => expect(dentroAgendamento(desligado, agora)).toBe(false))
  it('24h sempre aceita', () => expect(dentroAgendamento(vinteQuatro, agora)).toBe(true))
  it('faixa no dia/horario aceita', () => expect(dentroAgendamento(faixaAgora, agora)).toBe(true))
  it('faixa em outro dia nao aceita', () => expect(dentroAgendamento(faixaOutroDia, agora)).toBe(false))
})

// Movidos do modulo da api (apps/api/.../disponibilidade/calculo.test.ts) ao absorver o kernel.
describe('momentoSp', () => {
  it('converte para o dia civil e minuto em America/Sao_Paulo', () => {
    expect(MINUTO).toBe(12 * 60)
    expect(DATA).toBe('2026-10-28')
    expect(dia).toBeGreaterThanOrEqual(0)
    expect(dia).toBeLessThanOrEqual(6)
  })
})

describe('lojaAceitandoAgora', () => {
  const horarioAberto = [{ dia_semana: dia, abre: '09:00', fecha: '18:00' }]

  it('dentro do horario do dia: aceita', () => {
    expect(lojaAceitandoAgora({ horarios: horarioAberto, excecoes: [] }, agora)).toBe(true)
  })

  it('fora do horario do dia: nao aceita', () => {
    const horarios = [{ dia_semana: dia, abre: '13:00', fecha: '18:00' }]
    expect(lojaAceitandoAgora({ horarios, excecoes: [] }, agora)).toBe(false)
  })

  it('sem horario para o dia: nao aceita', () => {
    const outroDia = [{ dia_semana: (dia + 1) % 7, abre: '00:00', fecha: '23:59' }]
    expect(lojaAceitandoAgora({ horarios: outroDia, excecoes: [] }, agora)).toBe(false)
  })

  it('feriado (excecao fechada) vence o horario aberto: nao aceita', () => {
    const excecoes = [{ data: DATA, fechado: true, abre: null, fecha: null }]
    expect(lojaAceitandoAgora({ horarios: horarioAberto, excecoes }, agora)).toBe(false)
  })

  it('excecao aberta com faixa propria vence o horario do dia', () => {
    const horarios = [{ dia_semana: dia, abre: '13:00', fecha: '18:00' }] // fechada as 12:00
    const excecoes = [{ data: DATA, fechado: false, abre: '08:00', fecha: '14:00' }]
    expect(lojaAceitandoAgora({ horarios, excecoes }, agora)).toBe(true)
  })

  it('faixa que cruza a meia-noite vale na madrugada', () => {
    // 2026-10-28T04:00:00Z = 01:00 SP. Faixa 18:00->02:00 do dia anterior cobre 01:00.
    const madrugada = new Date('2026-10-28T04:00:00Z')
    const diaAnterior = (momentoSp(madrugada).dia + 6) % 7
    const horarios = [{ dia_semana: diaAnterior, abre: '18:00', fecha: '02:00' }]
    expect(lojaAceitandoAgora({ horarios, excecoes: [] }, madrugada)).toBe(true)
  })
})

describe('faixasSobrepoem', () => {
  it('detecta sobreposicao e aceita faixas adjacentes', () => {
    expect(faixasSobrepoem({ abre: '09:00', fecha: '12:00' }, { abre: '11:00', fecha: '15:00' })).toBe(true)
    expect(faixasSobrepoem({ abre: '09:00', fecha: '12:00' }, { abre: '12:00', fecha: '15:00' })).toBe(false)
    expect(faixasSobrepoem({ abre: '18:00', fecha: '02:00' }, { abre: '01:00', fecha: '03:00' })).toBe(true)
  })
})
