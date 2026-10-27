import { describe, expect, it } from 'vitest'
import { contratoClienteMapas } from '@whaviso/shared/clientes/testing'
import { criarMapasStub, PONTO_PADRAO_STUB } from './index'

contratoClienteMapas('mapas_client stub', () => criarMapasStub())

describe('mapas_client stub', () => {
  it('geocodifica qualquer endereco para o ponto padrao', async () => {
    const r = await criarMapasStub().geocodificar('Qualquer rua 1')
    expect(r.ok && r.valor).toEqual({ ...PONTO_PADRAO_STUB, precisao: 'aproximada' })
  })
})
