import { describe, it, expect } from 'vitest'
import { CredencialResolvida, ErroProvedor } from '../erros'
import type { ClienteCanal } from '../canais'
import { PedidoExterno } from '../../contracts/canais'

/** Suite de contrato: stub, fake e a implementacao real devem passar. */
export function contratoClienteCanal(nome: string, fabrica: () => ClienteCanal): void {
  const cred = new CredencialResolvida('credencial-de-teste-0123456789')
  describe(`contrato ClienteCanal: ${nome}`, () => {
    it('buscarPedidos devolve pedidos canonicos validos ou erro tipado', async () => {
      const r = await fabrica().buscarPedidos(cred, {})
      if (r.ok) for (const p of r.valor) expect(PedidoExterno.safeParse(p).success).toBe(true)
      else expect(r.erro).toBeInstanceOf(ErroProvedor)
    })
    it('confirmar devolve ok ou erro tipado', async () => {
      const r = await fabrica().confirmar(cred, 'ext-1')
      if (!r.ok) expect(r.erro).toBeInstanceOf(ErroProvedor)
    })
  })
}
