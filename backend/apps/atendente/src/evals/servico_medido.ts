// Decorador do ServicoLlm para o runner: (1) injeta o `modelo` do sweep quando a chamada nao define
// um; (2) acumula o uso (tokens/custo) das chamadas bem-sucedidas, para o resultado por caso. Nao
// altera credencial, teto nem contabilidade `uso_llm` (isso segue no servico real).
import type { ServicoLlm } from '../shared/llm_client'

export interface ServicoMedido {
  servico: ServicoLlm
  tomarUso(): { tokensIn: number; tokensOut: number; custoCentavos: number }
}

export function medirServico(base: ServicoLlm, modelo?: string): ServicoMedido {
  let tokensIn = 0
  let tokensOut = 0
  let custoCentavos = 0
  const somar = (u: { tokensIn: number; tokensOut: number; custoEstimadoCentavos: number }): void => {
    tokensIn += u.tokensIn
    tokensOut += u.tokensOut
    custoCentavos += u.custoEstimadoCentavos
  }
  const servico: ServicoLlm = {
    async completar(e) {
      const r = await base.completar(modelo && !e.modelo ? { ...e, modelo } : e)
      if (r.ok) somar(r.valor.uso)
      return r
    },
    async completarEstruturado(e, schema) {
      const r = await base.completarEstruturado(modelo && !e.modelo ? { ...e, modelo } : e, schema)
      if (r.ok) somar(r.valor.resposta.uso)
      return r
    },
    transcrever: (e) => base.transcrever(e),
    descreverImagem: (e) => base.descreverImagem(e),
  }
  return {
    servico,
    tomarUso() {
      const u = { tokensIn, tokensOut, custoCentavos }
      tokensIn = 0
      tokensOut = 0
      custoCentavos = 0
      return u
    },
  }
}
