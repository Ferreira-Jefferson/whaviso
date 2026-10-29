import { describe, expect, it } from 'vitest'
import { escolherTaxa } from './index'

describe('escolherTaxa', () => {
  it('override numerico do plano vence o padrao (inclusive 0 = taxa zero explicita)', () => {
    expect(escolherTaxa(50, 40)).toBe(40)
    expect(escolherTaxa(50, 30)).toBe(30)
    expect(escolherTaxa(50, 0)).toBe(0)
  })

  it('NULL herda o padrao da plataforma', () => {
    expect(escolherTaxa(50, null)).toBe(50)
  })

  it('ausente (undefined) herda o padrao da plataforma', () => {
    expect(escolherTaxa(50, undefined)).toBe(50)
  })
})
