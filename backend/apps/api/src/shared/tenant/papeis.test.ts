// Unidade: tabela de papeis (politica de permissao por papel de loja).
import { describe, it, expect } from 'vitest'
import { PERMISSOES_POR_PAPEL, papelPermite, papelMaisForte } from './papeis'

describe('tabela de papeis', () => {
  it('dono tem todas as permissoes', () => {
    for (const p of PERMISSOES_POR_PAPEL.dono) expect(papelPermite('dono', p)).toBe(true)
  })

  it('gerente opera a loja (loja:gerir, pedidos, relatorios)', () => {
    expect(papelPermite('gerente', 'loja:gerir')).toBe(true)
    expect(papelPermite('gerente', 'pedidos:gerir')).toBe(true)
    expect(papelPermite('gerente', 'relatorios:ver')).toBe(true)
  })

  it('atendente so conversas e pedidos', () => {
    expect(papelPermite('atendente', 'pedidos:gerir')).toBe(true)
    expect(papelPermite('atendente', 'conversas:atender')).toBe(true)
    expect(papelPermite('atendente', 'loja:gerir')).toBe(false)
    expect(papelPermite('atendente', 'relatorios:ver')).toBe(false)
  })

  it('papelMaisForte resolve a precedencia dono > gerente > atendente', () => {
    expect(papelMaisForte('atendente', 'dono')).toBe('dono')
    expect(papelMaisForte('gerente', 'atendente')).toBe('gerente')
    expect(papelMaisForte('gerente', 'dono')).toBe('dono')
    expect(papelMaisForte('atendente', 'atendente')).toBe('atendente')
  })
})
