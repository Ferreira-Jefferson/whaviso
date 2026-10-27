// Node `endereco`: resolve o endereco da entrega. Dois caminhos:
//   - botao "Ultimo endereco" -> reusa o ultimo endereco do cliente (id vindo do contexto, que o
//     motor carregou para ESTE cliente; nunca do conteudo da mensagem).
//   - botao "Informar outro" ou loja sem endereco previo -> pede o texto; o proximo turno (com
//     aguardando = 'endereco_novo') cria o endereco a partir do texto (efeito do motor).
// Resolvido o endereco, segue para a forma de pagamento. A taxa de entrega e calculada no motor
// na criacao do pedido (zona por bairro), nunca aqui. SEM LLM.
import type { NodeContract, SaidaNode } from '@whaviso/shared/contracts'
import { efeitoCriarEndereco, efeitoEstado, saida, texto } from '../acoes'
import { promptPagamento, reapresentar } from '../comum'
import { botaoIgual } from '../entrada'
import { BOTAO_END_NOVO, BOTAO_END_ULTIMO } from '../ids'
import { ConfigVazia, type EntradaTurno, type EstadoFluxo } from '../tipos'

export const enderecoNode: NodeContract<ConfigVazia, EntradaTurno> = {
  tipo: 'endereco',
  usaLlm: false,
  configSchema: ConfigVazia,
  async executar(entrada) {
    const { evento, estado, ultimoEnderecoId } = entrada

    if (estado.aguardando === 'endereco_novo') {
      const logradouro = evento.texto
      if (!logradouro || logradouro.length < 4) {
        return reapresentar(estado, texto('Nao entendi o endereco. Informe rua, numero e bairro:'))
      }
      const proximo: EstadoFluxo = { ...estado, etapa: 'pagamento', aguardando: null, apresentados: [], falhas: 0 }
      // criar_endereco seta estado.endereco_id no motor (merge sobre o estado acima).
      return saida('pagamento', [promptPagamento()], [efeitoEstado(proximo), efeitoCriarEndereco(logradouro)])
    }

    if (botaoIgual(evento, BOTAO_END_ULTIMO) && ultimoEnderecoId) {
      const proximo: EstadoFluxo = { ...estado, etapa: 'pagamento', endereco_id: ultimoEnderecoId, aguardando: null, falhas: 0 }
      return saida('pagamento', [promptPagamento()], [efeitoEstado(proximo)])
    }

    if (botaoIgual(evento, BOTAO_END_NOVO)) {
      const proximo: EstadoFluxo = { ...estado, aguardando: 'endereco_novo', apresentados: [], falhas: 0 }
      return saida('endereco', [texto('Informe o endereco de entrega (rua, numero e bairro):')], [efeitoEstado(proximo)])
    }

    return reaskEndereco(estado, ultimoEnderecoId)
  },
}

/** Reapresenta a pergunta de endereco no formato certo (botoes se ha ultimo; senao, texto). */
function reaskEndereco(estado: EstadoFluxo, ultimoEnderecoId: string | null): SaidaNode {
  if (ultimoEnderecoId) {
    return reapresentar(estado, texto('Toque em "Ultimo endereco" ou "Informar outro" para seguir.'))
  }
  return reapresentar(estado, texto('Informe o endereco de entrega (rua, numero e bairro):'))
}
