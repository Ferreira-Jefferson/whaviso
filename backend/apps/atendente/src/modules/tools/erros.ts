// Erro ACIONAVEL de tool: o `codigo` e estavel e a `mensagem` orienta o modelo (sem stack, sem
// dado de outra loja, sem PII). Qualquer outra excecao vira `erro_interno` generico no registry.
export class ErroTool extends Error {
  constructor(
    public readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroTool'
  }
}

/** Mesma resposta para id inexistente e id de OUTRA loja: nao confirma a existencia (SEC-064). */
export const referenciaInvalida = (): ErroTool =>
  new ErroTool('referencia_invalida', 'Referencia nao encontrada. Busque de novo no cardapio e use um id retornado por ele.')
