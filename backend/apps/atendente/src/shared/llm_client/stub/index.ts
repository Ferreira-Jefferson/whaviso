import { createHash } from 'node:crypto'
import {
  montarRequisicaoLlm,
  ok,
  type ClienteLLM,
  type RequisicaoLlm,
  type RespostaCompletar,
  type UsoLlm,
} from '@whaviso/shared/clientes'

// Stub de ClienteLLM para dev/testes do atendente: resposta enlatada por chave de cenario
// (`chaveCenario` da entrada), sem rede. A implementacao real (AT-llm) substitui este diretorio.
// A requisicao e montada por `montarRequisicaoLlm`: a credencial fica so no header (SEC-026).

export const MODELO_STUB = 'stub-1'

export interface OpcoesLlmStub {
  /** Respostas por chave de cenario. */
  cenarios?: Record<string, Partial<RespostaCompletar>>
  /** Resposta quando a chave nao existe. */
  padrao?: Partial<RespostaCompletar>
}

export interface LlmStub extends ClienteLLM {
  /** Requisicoes montadas ate agora (headers + body), para inspecao em testes. */
  readonly requisicoes: RequisicaoLlm[]
}

const uso = (tin: number, tout: number): UsoLlm => ({ tokensIn: tin, tokensOut: tout, custoEstimadoCentavos: 0 })

export function criarLlmStub(op: OpcoesLlmStub = {}): LlmStub {
  const requisicoes: RequisicaoLlm[] = []
  return {
    requisicoes,
    async completar(entrada) {
      requisicoes.push(montarRequisicaoLlm(entrada, MODELO_STUB))
      const pronta = (entrada.chaveCenario && op.cenarios?.[entrada.chaveCenario]) || op.padrao || {}
      const texto = pronta.texto ?? 'resposta-stub'
      return ok({
        texto,
        chamadasFerramenta: pronta.chamadasFerramenta ?? [],
        modelo: pronta.modelo ?? entrada.modelo ?? MODELO_STUB,
        uso: pronta.uso ?? uso(1, Math.max(1, Math.ceil(texto.length / 4))),
      })
    },
    async transcrever() {
      return ok({ texto: 'transcricao-stub', uso: uso(1, 1) })
    },
    async descreverImagem() {
      return ok({ descricao: 'imagem-stub', uso: uso(1, 1) })
    },
    async embutir(entrada) {
      const vetores = entrada.textos.map((t) => {
        const h = createHash('sha256').update(t).digest()
        return Array.from({ length: 8 }, (_, i) => (h[i]! - 127.5) / 127.5)
      })
      return ok({ vetores, uso: uso(entrada.textos.length, 0) })
    },
  }
}
