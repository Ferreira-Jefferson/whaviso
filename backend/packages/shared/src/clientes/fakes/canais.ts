import { falha, ok, type ErroProvedor } from '../erros'
import type { BuscarPedidosEntrada, ClienteCanal } from '../canais'
import type { PedidoExterno } from '../../contracts/canais'

/** Fake deterministico: devolve os pedidos enfileirados e registra confirmacoes (sem rede). */
export class FakeClienteCanal implements ClienteCanal {
  readonly buscas: BuscarPedidosEntrada[] = []
  readonly confirmados: string[] = []
  readonly #fila: unknown[] = []
  #erro: ErroProvedor | undefined

  /** Aceita `unknown` de proposito: testes injetam payload invalido para exercitar a revalidacao. */
  enfileirar(...pedidos: unknown[]): this {
    this.#fila.push(...pedidos)
    return this
  }

  falharSempre(erro: ErroProvedor | undefined): this {
    this.#erro = erro
    return this
  }

  async buscarPedidos(_cred: unknown, entrada: BuscarPedidosEntrada) {
    this.buscas.push(entrada)
    if (this.#erro) return falha(this.#erro)
    return ok(this.#fila as PedidoExterno[])
  }

  async confirmar(_cred: unknown, idExterno: string) {
    if (this.#erro) return falha(this.#erro)
    this.confirmados.push(idExterno)
    return ok(undefined)
  }
}
