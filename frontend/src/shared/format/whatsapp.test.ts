import { describe, expect, it } from 'vitest'
import { tokenizarWhatsApp } from './whatsapp'

describe('tokenizarWhatsApp', () => {
  it('texto sem marcador vira um único segmento neutro', () => {
    expect(tokenizarWhatsApp('Olá, Ana.')).toEqual([
      { texto: 'Olá, Ana.', negrito: false, italico: false },
    ])
  })

  it('string vazia vira lista vazia', () => {
    expect(tokenizarWhatsApp('')).toEqual([])
  })

  it('reconhece negrito simples', () => {
    expect(tokenizarWhatsApp('a *b* c')).toEqual([
      { texto: 'a ', negrito: false, italico: false },
      { texto: 'b', negrito: true, italico: false },
      { texto: ' c', negrito: false, italico: false },
    ])
  })

  it('reconhece itálico simples', () => {
    expect(tokenizarWhatsApp('_oi_')).toEqual([{ texto: 'oi', negrito: false, italico: true }])
  })

  it('reconhece negrito e itálico aninhados', () => {
    expect(tokenizarWhatsApp('*negrito _e itálico_*')).toEqual([
      { texto: 'negrito ', negrito: true, italico: false },
      { texto: 'e itálico', negrito: true, italico: true },
    ])
  })

  it('marcador sem par fica literal', () => {
    expect(tokenizarWhatsApp('preço é *10')).toEqual([
      { texto: 'preço é *10', negrito: false, italico: false },
    ])
  })

  it('marcador vazio (**) fica literal', () => {
    expect(tokenizarWhatsApp('a ** b')).toEqual([
      { texto: 'a ** b', negrito: false, italico: false },
    ])
  })

  it('preserva quebras de linha dentro e fora dos marcadores', () => {
    const texto = 'Olá.\n\n*Combinado*: aula\n*Valor*: R$ 120,00'
    expect(tokenizarWhatsApp(texto)).toEqual([
      { texto: 'Olá.\n\n', negrito: false, italico: false },
      { texto: 'Combinado', negrito: true, italico: false },
      { texto: ': aula\n', negrito: false, italico: false },
      { texto: 'Valor', negrito: true, italico: false },
      { texto: ': R$ 120,00', negrito: false, italico: false },
    ])
  })

  it('lida com vários trechos formatados na mesma linha', () => {
    expect(tokenizarWhatsApp('*a* e _b_')).toEqual([
      { texto: 'a', negrito: true, italico: false },
      { texto: ' e ', negrito: false, italico: false },
      { texto: 'b', negrito: false, italico: true },
    ])
  })
})
