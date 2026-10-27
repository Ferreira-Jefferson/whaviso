// Node `pagamento`: forma de pagamento por botoes (Pix, dinheiro, cartao na entrega). Registrado
// o metodo, propoe criar o pedido (o motor cria o pedido `novo`, calcula a taxa e avisa o cliente
// com o codigo gerado; a geracao do BR Code do Pix e do modulo pagamentos, onda 3). SEM LLM.
import type { NodeContract } from '@whaviso/shared/contracts'
import { efeitoCriarPedido, efeitoEstado, saida } from '../acoes'
import { promptPagamento, reapresentar } from '../comum'
import { BOTAO_PAG_CARTAO, BOTAO_PAG_DINHEIRO, BOTAO_PAG_PIX } from '../ids'
import { ConfigVazia, type EntradaTurno, type EstadoFluxo } from '../tipos'

const POR_BOTAO: Record<string, EstadoFluxo['pagamento']> = {
  [BOTAO_PAG_PIX]: 'pix',
  [BOTAO_PAG_DINHEIRO]: 'dinheiro',
  [BOTAO_PAG_CARTAO]: 'cartao',
}

export const pagamentoNode: NodeContract<ConfigVazia, EntradaTurno> = {
  tipo: 'pagamento',
  usaLlm: false,
  configSchema: ConfigVazia,
  async executar(entrada) {
    const { evento, estado } = entrada
    const metodo = evento.botaoId ? POR_BOTAO[evento.botaoId] : undefined
    if (!metodo) {
      return reapresentar(estado, promptPagamento())
    }
    const proximo: EstadoFluxo = { ...estado, etapa: 'acompanhar', pagamento: metodo, apresentados: [], falhas: 0 }
    // O motor efetiva: cria o pedido `novo` (preco/taxa no servidor) e avisa com o codigo.
    return saida('acompanhar', [], [efeitoEstado(proximo), efeitoCriarPedido()])
  },
}
