import { describe, it, expect } from 'vitest'
import { CredencialResolvida, ErroProvedor } from '../erros'
import type { ClienteWhats } from '../whats'

export interface FabricaWhats {
  cliente: ClienteWhats
  /** Opcional: assina um corpo com o segredo do cliente, para checar o caminho feliz do webhook. */
  assinar?: (rawBody: string) => string
}

const numero = () => ({ phoneNumberId: '100200300', credencial: new CredencialResolvida('cred-teste') })
const para = '+5511999998888'

/** Suite de contrato: stub, fake e a implementacao real (ZAP-meta) devem passar. */
export function contratoClienteWhats(nome: string, fabrica: () => FabricaWhats): void {
  describe(`contrato ClienteWhats: ${nome}`, () => {
    it('operacoes de envio devolvem wamid ou erro tipado', async () => {
      const { cliente } = fabrica()
      const resultados = [
        await cliente.enviarTexto({ numero: numero(), para, texto: 'oi' }),
        await cliente.enviarTemplate({ numero: numero(), para, nome: 't', idioma: 'pt_BR', componentes: [] }),
        await cliente.enviarInterativo({
          numero: numero(),
          para,
          corpo: 'escolha',
          interacao: { tipo: 'botoes', botoes: [{ id: 'a', titulo: 'A' }] },
        }),
        await cliente.enviarMidia({ numero: numero(), para, tipo: 'image', mediaId: 'm1' }),
      ]
      for (const r of resultados) {
        if (r.ok) expect(r.valor.wamid).toMatch(/.+/)
        else expect(r.erro).toBeInstanceOf(ErroProvedor)
      }
    })

    it('wamids sao distintos entre envios', async () => {
      const { cliente } = fabrica()
      const a = await cliente.enviarTexto({ numero: numero(), para, texto: 'a' })
      const b = await cliente.enviarTexto({ numero: numero(), para, texto: 'b' })
      expect(a.ok && b.ok && a.valor.wamid !== b.valor.wamid).toBe(true)
    })

    it('baixarMidia devolve bytes e mimeType; marcarLida resolve', async () => {
      const { cliente } = fabrica()
      const m = await cliente.baixarMidia({ numero: numero(), mediaId: 'm1' })
      if (m.ok) {
        expect(m.valor.bytes).toBeInstanceOf(Uint8Array)
        expect(m.valor.mimeType).toMatch(/.+/)
      }
      const l = await cliente.marcarLida({ numero: numero(), wamid: 'wamid.x' })
      expect(typeof l.ok).toBe('boolean')
    })

    it('verificarAssinatura rejeita ausente, malformada e errada', () => {
      const { cliente } = fabrica()
      expect(cliente.verificarAssinatura('{}', undefined)).toBe(false)
      expect(cliente.verificarAssinatura('{}', 'abc')).toBe(false)
      expect(cliente.verificarAssinatura('{}', `sha256=${'0'.repeat(64)}`)).toBe(false)
    })

    it('verificarAssinatura aceita a assinatura valida e rejeita corpo adulterado', () => {
      const { cliente, assinar } = fabrica()
      if (!assinar) return
      const corpo = '{"entry":[]}'
      expect(cliente.verificarAssinatura(corpo, assinar(corpo))).toBe(true)
      expect(cliente.verificarAssinatura(corpo + ' ', assinar(corpo))).toBe(false)
    })
  })
}
