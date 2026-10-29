import { describe, expect, it } from 'vitest'
import { comporCobranca } from './composicao'

describe('comporCobranca', () => {
  it('absorve: cliente paga o total; a parte do whaviso e a taxa', () => {
    expect(comporCobranca(6000, 50, 'absorve')).toEqual({
      valorCobradoCentavos: 6000,
      encargoWhavisoCentavos: 50,
    })
  })

  it('repassa: cliente paga total + taxa; restaurante recebe o total cheio', () => {
    expect(comporCobranca(6000, 50, 'repassa')).toEqual({
      valorCobradoCentavos: 6050,
      encargoWhavisoCentavos: 50,
    })
  })

  it('taxa zero nao muda o valor cobrado em nenhum modo', () => {
    expect(comporCobranca(6000, 0, 'absorve')).toEqual({ valorCobradoCentavos: 6000, encargoWhavisoCentavos: 0 })
    expect(comporCobranca(6000, 0, 'repassa')).toEqual({ valorCobradoCentavos: 6000, encargoWhavisoCentavos: 0 })
  })
})
