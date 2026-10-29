import { createHmac } from 'node:crypto'
import { ok, falha, type ErroProvedor } from '../erros'
import {
  verificarAssinaturaHmac,
  type BaixarMidiaEntrada,
  type ClienteWhats,
  type EnviarInterativoEntrada,
  type EnviarMidiaEntrada,
  type EnviarTemplateEntrada,
  type EnviarTextoEntrada,
  type MarcarLidaEntrada,
  type ResultadoWhats,
} from '../whats'

export type OperacaoWhats =
  | 'enviarTexto'
  | 'enviarTemplate'
  | 'enviarInterativo'
  | 'enviarMidia'
  | 'baixarMidia'
  | 'marcarLida'

export interface ChamadaWhats {
  operacao: OperacaoWhats
  entrada: unknown
}

/** Fake em memoria: grava chamadas e permite programar falha por chamada (indice global, base 0). */
export class FakeClienteWhats implements ClienteWhats {
  readonly chamadas: ChamadaWhats[] = []
  readonly #falhas = new Map<number, ErroProvedor>()
  #falhaSempre: ErroProvedor | undefined
  #seq = 0
  midia = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/octet-stream' }

  constructor(private readonly segredoWebhook = 'segredo-fake') {}

  /** A N-esima chamada (base 0, contando todas as operacoes) falha com este erro. */
  falharNaChamada(indice: number, erro: ErroProvedor): this {
    this.#falhas.set(indice, erro)
    return this
  }

  /** Toda chamada falha ate `limpar()`. */
  falharSempre(erro: ErroProvedor): this {
    this.#falhaSempre = erro
    return this
  }

  limpar(): void {
    this.#falhas.clear()
    this.#falhaSempre = undefined
  }

  /** Assinatura valida para o corpo (para testes de webhook). */
  assinar(rawBody: string | Uint8Array): string {
    return `sha256=${createHmac('sha256', this.segredoWebhook).update(rawBody).digest('hex')}`
  }

  #registrar(operacao: OperacaoWhats, entrada: unknown): ErroProvedor | undefined {
    const indice = this.chamadas.length
    this.chamadas.push({ operacao, entrada })
    return this.#falhas.get(indice) ?? this.#falhaSempre
  }

  async #envio(operacao: OperacaoWhats, entrada: unknown): ResultadoWhats<{ wamid: string }> {
    const erro = this.#registrar(operacao, entrada)
    if (erro) return falha(erro)
    this.#seq += 1
    return ok({ wamid: `wamid.fake.${this.#seq}` })
  }

  enviarTexto(e: EnviarTextoEntrada) {
    return this.#envio('enviarTexto', e)
  }
  enviarTemplate(e: EnviarTemplateEntrada) {
    return this.#envio('enviarTemplate', e)
  }
  enviarInterativo(e: EnviarInterativoEntrada) {
    return this.#envio('enviarInterativo', e)
  }
  enviarMidia(e: EnviarMidiaEntrada) {
    return this.#envio('enviarMidia', e)
  }
  async baixarMidia(e: BaixarMidiaEntrada) {
    const erro = this.#registrar('baixarMidia', e)
    return erro ? falha(erro) : ok({ ...this.midia })
  }
  async marcarLida(e: MarcarLidaEntrada) {
    const erro = this.#registrar('marcarLida', e)
    return erro ? falha(erro) : ok(undefined)
  }
  verificarAssinatura(rawBody: string | Uint8Array, header: string | undefined): boolean {
    return verificarAssinaturaHmac(rawBody, header, this.segredoWebhook)
  }
}

