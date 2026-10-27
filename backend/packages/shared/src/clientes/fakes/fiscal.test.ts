import { describe, it, expect } from 'vitest'
import { contratoClienteFiscal } from '../contratos/fiscal'
import { FakeClienteFiscal, chaveFiscalFake } from './fiscal'
import { Transitorio } from '../erros'

contratoClienteFiscal('FakeClienteFiscal', () => new FakeClienteFiscal())

describe('FakeClienteFiscal', () => {
  it('chave deterministica de 44 digitos', () => {
    expect(chaveFiscalFake('a')).toMatch(/^[0-9]{44}$/)
    expect(chaveFiscalFake('a')).toBe(chaveFiscalFake('a'))
  })
  it('falha programavel vira erro tipado', async () => {
    const f = new FakeClienteFiscal().falharSempre(new Transitorio())
    const r = await f.emitir({} as never)
    expect(r.ok).toBe(false)
  })
})
