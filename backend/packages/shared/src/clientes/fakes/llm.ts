import { createHash } from 'node:crypto'
import { ok, falha, type ErroProvedor } from '../erros'
import {
  montarRequisicaoLlm,
  type ClienteLLM,
  type CompletarEntrada,
  type DescreverImagemEntrada,
  type EmbutirEntrada,
  type RequisicaoLlm,
  type RespostaCompletar,
  type TranscreverEntrada,
  type UsoLlm,
} from '../llm'

export const MODELO_FAKE = 'fake-1'
export const DIM_EMBEDDING_FAKE = 8

const estimarTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4))
const usoZero = (tin: number, tout: number): UsoLlm => ({ tokensIn: tin, tokensOut: tout, custoEstimadoCentavos: 0 })

/** Vetor deterministico (hash do texto) em [-1, 1]. */
export function embeddingDeterministico(texto: string): number[] {
  const h = createHash('sha256').update(texto).digest()
  return Array.from({ length: DIM_EMBEDDING_FAKE }, (_, i) => (h[i]! - 127.5) / 127.5)
}

/** Fake deterministico: respostas por chave de cenario, falha programavel, grava requisicoes montadas. */
export class FakeClienteLLM implements ClienteLLM {
  /** Requisicoes montadas (headers + body) por chamada de `completar`, para os testes SEC-026. */
  readonly requisicoes: RequisicaoLlm[] = []
  readonly entradas: CompletarEntrada[] = []
  readonly #cenarios = new Map<string, Partial<RespostaCompletar>>()
  #erro: ErroProvedor | undefined

  /** Resposta enlatada para uma chave de cenario. */
  cenario(chave: string, resposta: Partial<RespostaCompletar>): this {
    this.#cenarios.set(chave, resposta)
    return this
  }

  falharSempre(erro: ErroProvedor | undefined): this {
    this.#erro = erro
    return this
  }

  async completar(entrada: CompletarEntrada) {
    this.entradas.push(entrada)
    this.requisicoes.push(montarRequisicaoLlm(entrada, MODELO_FAKE))
    if (this.#erro) return falha(this.#erro)
    const pronta = entrada.chaveCenario ? this.#cenarios.get(entrada.chaveCenario) : undefined
    const ultima = entrada.mensagens[entrada.mensagens.length - 1]?.conteudo ?? ''
    const texto = pronta?.texto ?? 'resposta-fake'
    const resposta: RespostaCompletar = {
      texto,
      chamadasFerramenta: pronta?.chamadasFerramenta ?? [],
      modelo: pronta?.modelo ?? entrada.modelo ?? MODELO_FAKE,
      uso: pronta?.uso ?? usoZero(estimarTokens(ultima), estimarTokens(texto)),
    }
    return ok(resposta)
  }

  async transcrever(entrada: TranscreverEntrada) {
    if (this.#erro) return falha(this.#erro)
    return ok({ texto: `transcricao-fake-${entrada.audio.bytes.length}`, uso: usoZero(1, 1) })
  }

  async descreverImagem(entrada: DescreverImagemEntrada) {
    if (this.#erro) return falha(this.#erro)
    return ok({ descricao: `imagem-fake-${entrada.imagem.bytes.length}`, uso: usoZero(1, 1) })
  }

  async embutir(entrada: EmbutirEntrada) {
    if (this.#erro) return falha(this.#erro)
    return ok({
      vetores: entrada.textos.map(embeddingDeterministico),
      uso: usoZero(entrada.textos.reduce((s, t) => s + estimarTokens(t), 0), 0),
    })
  }
}
