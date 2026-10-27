import { createHash } from 'node:crypto'
import { ok, falha, type ErroProvedor } from '../erros'
import type { ClienteFiscal, EmitirFiscalEntrada, EmitirFiscalResposta } from '../fiscal'

/** Chave deterministica de 44 digitos a partir da referencia (so para teste/stub). */
export function chaveFiscalFake(referencia: string): string {
  const h = createHash('sha256').update(referencia).digest()
  return Array.from({ length: 44 }, (_, i) => String(h[i % h.length]! % 10)).join('')
}

export interface OpcoesFakeFiscal {
  /** Resposta fixa; sem ela, emite com chave deterministica e link de exemplo. */
  resposta?: EmitirFiscalResposta
}

/** Fake/stub: nenhum provedor real. Idempotente por `referencia`, falha programavel, grava chamadas. */
export class FakeClienteFiscal implements ClienteFiscal {
  /** Entradas recebidas (a credencial e opaca: nao vaza por serializacao). */
  readonly chamadas: EmitirFiscalEntrada[] = []
  readonly #resposta: EmitirFiscalResposta | undefined
  #erro: ErroProvedor | undefined

  constructor(op: OpcoesFakeFiscal = {}) {
    this.#resposta = op.resposta
  }

  falharSempre(erro: ErroProvedor | undefined): this {
    this.#erro = erro
    return this
  }

  async emitir(entrada: EmitirFiscalEntrada) {
    this.chamadas.push(entrada)
    if (this.#erro) return falha(this.#erro)
    if (this.#resposta) return ok(this.#resposta)
    const chave = chaveFiscalFake(entrada.referencia)
    return ok<EmitirFiscalResposta>({
      status: 'emitido',
      chave,
      link: `https://emissor.exemplo.invalid/${entrada.tipo}/${chave}`,
      erro: null,
    })
  }
}
