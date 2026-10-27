import { describe, expect, it } from 'vitest'
import { aplicarBranding, calcularBranding, primariaDe } from './branding'
import { iniciais } from './iniciais'

describe('branding da loja', () => {
  it('aceita so hex #RRGGBB', () => {
    expect(primariaDe({ primaria: '#B4532A' })).toBe('#b4532a')
    expect(primariaDe({ primary: '#3a4f8a' })).toBe('#3a4f8a')
    expect(primariaDe({ primaria: 'red' })).toBeNull()
    expect(primariaDe({ primaria: 'url(javascript:1)' })).toBeNull()
    expect(primariaDe(null)).toBeNull()
  })

  it('calcula suave (mais claro) e cor de texto com contraste', () => {
    const escuro = calcularBranding({ primaria: '#1e4d3b' })
    expect(escuro?.sobrePrimaria).toBe('#faf7f0')
    expect(escuro?.primariaSuave).toMatch(/^#[0-9a-f]{6}$/)
    const claro = calcularBranding({ primaria: '#ffe066' })
    expect(claro?.sobrePrimaria).toBe('#20322a')
  })

  it('aplica e limpa as variaveis CSS', () => {
    const el = document.createElement('div')
    aplicarBranding(calcularBranding({ primaria: '#b4532a' }), el)
    expect(el.style.getPropertyValue('--cor-primaria')).toBe('#b4532a')
    aplicarBranding(null, el)
    expect(el.style.getPropertyValue('--cor-primaria')).toBe('')
  })

  it('iniciais do nome', () => {
    expect(iniciais('Cantina do Ze')).toBe('CZ')
    expect(iniciais('Sushi')).toBe('SU')
    expect(iniciais('  ')).toBe('?')
  })
})
