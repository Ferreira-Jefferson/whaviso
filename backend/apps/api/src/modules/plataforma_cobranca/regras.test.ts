// Testes de unidade das regras puras (sem banco, sem HTTP): virada de mes, fevereiro, fuso de
// competencia/vencimento, atraso vs carencia e tabela de transicoes.
import { describe, it, expect } from 'vitest'
import {
  calcularVencimento, classificarFatura, deveSuspender, diasEntre, mesCompetenciaDe,
  proximaCompetencia, transicaoValida,
} from './regras'

describe('competencia e vencimento', () => {
  it('mesCompetenciaDe devolve o 1o dia do mes do dia informado', () => {
    expect(mesCompetenciaDe('2026-10-27')).toBe('2026-10-01')
    expect(mesCompetenciaDe('2026-02-28')).toBe('2026-02-01')
  })

  it('proximaCompetencia avanca o mes e vira o ano em dezembro', () => {
    expect(proximaCompetencia('2026-01-01')).toBe('2026-02-01')
    expect(proximaCompetencia('2026-11-01')).toBe('2026-12-01')
    expect(proximaCompetencia('2026-12-01')).toBe('2027-01-01')
  })

  it('calcularVencimento usa o dia (1..28) do mes da competencia, com zero a esquerda', () => {
    expect(calcularVencimento(10, '2026-10-01')).toBe('2026-10-10')
    expect(calcularVencimento(5, '2026-10-01')).toBe('2026-10-05')
    // Fevereiro: dia 28 existe (o teto de 28 garante isso em qualquer mes, inclusive nao bissexto).
    expect(calcularVencimento(28, '2027-02-01')).toBe('2027-02-28')
  })

  it('calcularVencimento rejeita dia fora de 1..28', () => {
    expect(() => calcularVencimento(0, '2026-10-01')).toThrow()
    expect(() => calcularVencimento(29, '2026-10-01')).toThrow()
    expect(() => calcularVencimento(31, '2026-10-01')).toThrow()
  })
})

describe('diasEntre', () => {
  it('conta dias corridos atravessando mes e ano (sem sofrer com horario de verao)', () => {
    expect(diasEntre('2026-10-01', '2026-10-08')).toBe(7)
    expect(diasEntre('2026-10-08', '2026-10-01')).toBe(-7)
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1)
    expect(diasEntre('2026-02-15', '2026-02-15')).toBe(0)
  })
})

describe('classificarFatura', () => {
  it('aberta vencida ANTES de hoje vira atrasada; vencendo hoje ou depois permanece aberta', () => {
    expect(classificarFatura('2026-10-27', '2026-10-10', 'aberta')).toBe('atrasada')
    expect(classificarFatura('2026-10-27', '2026-10-27', 'aberta')).toBe('aberta')
    expect(classificarFatura('2026-10-27', '2026-10-28', 'aberta')).toBe('aberta')
  })

  it('nao mexe em paga, cancelada nem no que ja esta atrasada', () => {
    expect(classificarFatura('2026-10-27', '2026-01-10', 'paga')).toBe('paga')
    expect(classificarFatura('2026-10-27', '2026-01-10', 'cancelada')).toBe('cancelada')
    expect(classificarFatura('2026-10-27', '2026-01-10', 'atrasada')).toBe('atrasada')
  })
})

describe('deveSuspender', () => {
  const carencia = 7
  it('false quando nao ha atrasada, ou o atraso ainda esta dentro da carencia', () => {
    expect(deveSuspender([], carencia, '2026-10-27')).toBe(false)
    // 7 dias de atraso NAO passa da carencia (precisa ser > 7).
    expect(deveSuspender([{ status: 'atrasada', vencimento: '2026-10-20' }], carencia, '2026-10-27')).toBe(false)
    // aberta nao conta, mesmo vencida.
    expect(deveSuspender([{ status: 'aberta', vencimento: '2026-01-01' }], carencia, '2026-10-27')).toBe(false)
  })

  it('true quando ha atrasada com atraso maior que a carencia', () => {
    expect(deveSuspender([{ status: 'atrasada', vencimento: '2026-10-19' }], carencia, '2026-10-27')).toBe(true)
    expect(deveSuspender(
      [{ status: 'aberta', vencimento: '2026-10-25' }, { status: 'atrasada', vencimento: '2026-01-10' }],
      carencia, '2026-10-27',
    )).toBe(true)
  })
})

describe('transicaoValida', () => {
  it('permite as transicoes da tabela', () => {
    expect(transicaoValida('trial', 'ativa')).toBe(true)
    expect(transicaoValida('trial', 'cancelada')).toBe(true)
    expect(transicaoValida('ativa', 'suspensa')).toBe(true)
    expect(transicaoValida('ativa', 'cancelada')).toBe(true)
    expect(transicaoValida('suspensa', 'ativa')).toBe(true)
    expect(transicaoValida('suspensa', 'cancelada')).toBe(true)
  })

  it('nega transicoes invalidas, cancelada (terminal) e para o mesmo status', () => {
    expect(transicaoValida('trial', 'suspensa')).toBe(false)
    expect(transicaoValida('cancelada', 'ativa')).toBe(false)
    expect(transicaoValida('cancelada', 'cancelada')).toBe(false)
    expect(transicaoValida('ativa', 'ativa')).toBe(false)
    expect(transicaoValida('ativa', 'trial')).toBe(false)
  })
})
