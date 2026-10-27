// Node `confirmar`: resumo do carrinho ja foi mostrado com os botoes. Aqui so o clique importa:
//   Confirmar      -> segue para o endereco (repetir ultimo ou informar outro)
//   Adicionar mais -> volta a lista de categorias (novo item)
//   Cancelar       -> encerra a conversa sem criar pedido
// Texto livre "confirmar pedido" fora do botao NAO confirma: so o botao no estado certo confirma
// (SEC-061, o motor nunca trata texto livre como comando). SEM LLM.
import type { NodeContract, SaidaNode } from '@whaviso/shared/contracts'
import { botoes, efeitoEncerrar, efeitoEstado, saida, texto } from '../acoes'
import { menuCategorias, reapresentar } from '../comum'
import { botaoIgual } from '../entrada'
import { resumoCarrinho } from '../resumo'
import { BOTAO_CANCELAR, BOTAO_CONFIRMAR, BOTAO_END_NOVO, BOTAO_END_ULTIMO, BOTAO_MAIS } from '../ids'
import { ConfigVazia, type EntradaTurno, type EstadoFluxo } from '../tipos'

export const confirmarNode: NodeContract<ConfigVazia, EntradaTurno> = {
  tipo: 'confirmar',
  usaLlm: false,
  configSchema: ConfigVazia,
  async executar(entrada) {
    const { evento, estado, cardapio, ultimoEnderecoId } = entrada

    if (botaoIgual(evento, BOTAO_CANCELAR)) {
      return saida(null, [texto('Tudo bem, pedido cancelado. Quando quiser, e so chamar.')], [efeitoEncerrar()])
    }

    if (botaoIgual(evento, BOTAO_MAIS)) {
      const menu = menuCategorias(cardapio, 'Claro! Escolha a categoria do proximo item:')
      const proximo: EstadoFluxo = {
        ...estado,
        etapa: 'pedir_categoria',
        item_id: null,
        grupos_pendentes: [],
        opcoes_ids: [],
        apresentados: menu.ids,
        falhas: 0,
      }
      return saida('pedir_categoria', [texto(menu.texto)], [efeitoEstado(proximo)])
    }

    if (botaoIgual(evento, BOTAO_CONFIRMAR)) {
      if (estado.carrinho.length === 0) {
        const menu = menuCategorias(cardapio, 'Seu carrinho esta vazio. Escolha uma categoria:')
        return saida(
          'pedir_categoria',
          [texto(menu.texto)],
          [efeitoEstado({ ...estado, etapa: 'pedir_categoria', apresentados: menu.ids, falhas: 0 })],
        )
      }
      return irParaEndereco(estado, ultimoEnderecoId)
    }

    // Qualquer outra coisa (texto livre, botao desconhecido): reapresenta a pergunta de confirmacao.
    const resumo = resumoCarrinho(cardapio, estado.carrinho)
    return reapresentar(
      estado,
      botoes(`${resumo.texto}\n\nPosso confirmar o pedido?`, [
        { id: BOTAO_CONFIRMAR, rotulo: 'Confirmar' },
        { id: BOTAO_MAIS, rotulo: 'Adicionar mais' },
        { id: BOTAO_CANCELAR, rotulo: 'Cancelar' },
      ]),
    )
  },
}

/** Abre a etapa de endereco: se o cliente ja tem endereco, oferece repetir; senao, pede o texto. */
function irParaEndereco(estado: EstadoFluxo, ultimoEnderecoId: string | null): SaidaNode {
  if (ultimoEnderecoId) {
    const proximo: EstadoFluxo = { ...estado, etapa: 'endereco', aguardando: null, apresentados: [], falhas: 0 }
    return saida(
      'endereco',
      [
        botoes('Vamos a entrega. Usar seu ultimo endereco ou informar outro?', [
          { id: BOTAO_END_ULTIMO, rotulo: 'Ultimo endereco' },
          { id: BOTAO_END_NOVO, rotulo: 'Informar outro' },
        ]),
      ],
      [efeitoEstado(proximo)],
    )
  }
  const proximo: EstadoFluxo = { ...estado, etapa: 'endereco', aguardando: 'endereco_novo', apresentados: [], falhas: 0 }
  return saida(
    'endereco',
    [texto('Vamos a entrega. Informe o endereco (rua, numero e bairro):')],
    [efeitoEstado(proximo)],
  )
}
