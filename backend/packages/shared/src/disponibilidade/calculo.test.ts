import { describe, expect, it } from 'vitest'
import {
  modoAtendente,
  dentroAgendamento,
  momentoSp,
  type DadosDisponibilidade,
  type Agendamento,
} from './calculo'

// 12:00 em America/Sao_Paulo (UTC-3).
const agora = new Date('2026-10-28T15:00:00.000Z')
const { dia } = momentoSp(agora)

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
