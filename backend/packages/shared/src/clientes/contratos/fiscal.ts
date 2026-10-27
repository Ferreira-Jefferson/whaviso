import { describe, it, expect } from 'vitest'
import { CredencialResolvida, ErroProvedor } from '../erros'
import type { ClienteFiscal, EmitirFiscalEntrada } from '../fiscal'

const ENTRADA: EmitirFiscalEntrada = {
  referencia: 'doc-contrato-1',
  tipo: 'nfce',
  emitente: {
    cnpj: '12345678000195',
    regime: 'simples_nacional',
    serie: 1,
    ambiente: 'homologacao',
    credencial: new CredencialResolvida('segredo-de-teste-do-emissor'),
  },
  pedido: {
    codigo: 'P-100',
    totalCentavos: 3500,
    itens: [{ descricao: 'Pizza', quantidade: 1, valorUnitarioCentavos: 3500, valorTotalCentavos: 3500 }],
  },
}

/** Suite de contrato: stub, fake e o emissor real (quando escolhido) devem passar. */
export function contratoClienteFiscal(nome: string, fabrica: () => ClienteFiscal): void {
  describe(`contrato ClienteFiscal: ${nome}`, () => {
    it('emitir devolve resposta coerente com o status, ou erro tipado', async () => {
      const r = await fabrica().emitir(ENTRADA)
      if (!r.ok) {
        expect(r.erro).toBeInstanceOf(ErroProvedor)
        return
      }
      const v = r.valor
      if (v.status === 'emitido') expect(v.chave).toMatch(/.+/)
      if (v.status === 'erro') expect(v.erro).toMatch(/.+/)
      if (v.link) expect(v.link.startsWith('https://')).toBe(true)
    })

    it('nao devolve a credencial em nenhum campo da resposta', async () => {
      const r = await fabrica().emitir(ENTRADA)
      if (r.ok) expect(JSON.stringify(r.valor)).not.toContain('segredo-de-teste-do-emissor')
    })
  })
}
