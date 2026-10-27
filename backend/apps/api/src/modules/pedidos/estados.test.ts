import { describe, it, expect } from 'vitest'
import { statusPedido, modalidadePedido } from '@whaviso/shared/contracts'
import { destinosValidos, motivoObrigatorio, permiteCancelarLinha, podeTransicionar } from './estados'

// Matriz esperada. Retirada difere: sem saiu_entrega; em_preparo -> entregue direto.
const ENTREGA: Record<string, string[]> = {
  rascunho: ['novo'],
  novo: ['em_preparo', 'problema'],
  em_preparo: ['saiu_entrega', 'problema'],
  saiu_entrega: ['entregue', 'problema'],
  entregue: [],
  problema: ['em_preparo', 'saiu_entrega', 'entregue'],
}
const RETIRADA: Record<string, string[]> = {
  rascunho: ['novo'],
  novo: ['em_preparo', 'problema'],
  em_preparo: ['entregue', 'problema'],
  saiu_entrega: ['entregue', 'problema'],
  entregue: [],
  problema: ['em_preparo', 'entregue'],
}

describe('maquina de estados do pedido', () => {
  for (const [modalidade, matriz] of [['entrega', ENTREGA], ['retirada', RETIRADA]] as const) {
    it(`matriz completa (${modalidade}): toda combinacao de->para`, () => {
      for (const de of statusPedido.options) {
        for (const para of statusPedido.options) {
          const esperado = matriz[de]!.includes(para)
          expect(podeTransicionar(de, para, modalidade), `${modalidade} ${de}->${para}`).toBe(esperado)
        }
      }
    })
  }

  it('nao ha retrocesso fora de problema', () => {
    expect(podeTransicionar('em_preparo', 'novo', 'entrega')).toBe(false)
    expect(podeTransicionar('entregue', 'em_preparo', 'entrega')).toBe(false)
    expect(podeTransicionar('saiu_entrega', 'em_preparo', 'entrega')).toBe(false)
  })

  it('destinosValidos acompanha a matriz', () => {
    for (const m of modalidadePedido.options) {
      for (const de of statusPedido.options) {
        const esperado = [...(m === 'entrega' ? ENTREGA : RETIRADA)[de]!].sort()
        expect(destinosValidos(de, m).sort()).toEqual(esperado)
      }
    }
  })

  it('problema exige motivo; linha so cancela em novo/em_preparo', () => {
    expect(motivoObrigatorio('problema')).toBe(true)
    expect(motivoObrigatorio('entregue')).toBe(false)
    expect(statusPedido.options.filter(permiteCancelarLinha)).toEqual(['novo', 'em_preparo'])
  })
})
