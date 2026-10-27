import { falha, Permanente } from './erros'
import type { ClienteCanal } from './canais'

/** Stub de producao enquanto o provedor nao e escolhido: toda operacao falha como nao integrada. */
export class StubClienteCanal implements ClienteCanal {
  async buscarPedidos() {
    return falha(new Permanente('canal nao integrado', { codigo: 'canal_nao_integrado' }))
  }
  async confirmar() {
    return falha(new Permanente('canal nao integrado', { codigo: 'canal_nao_integrado' }))
  }
}
