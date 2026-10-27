// Node `pedir_categoria`: recebe a escolha de categoria (numero do menu ou id do botao, sempre
// revalidado contra o cardapio vivo da loja) e abre a lista de itens disponiveis dela. Entrada
// fora do esperado reapresenta o menu; apos N falhas, handoff. SEM LLM.
import type { NodeContract } from '@whaviso/shared/contracts'
import { efeitoEstado, saida, texto } from '../acoes'
import { formatarPreco, menuNumerado, reapresentar } from '../comum'
import { escolherDaLista } from '../entrada'
import { ConfigVazia, type EntradaTurno } from '../tipos'

export const pedirCategoriaNode: NodeContract<ConfigVazia, EntradaTurno> = {
  tipo: 'pedir_categoria',
  usaLlm: false,
  configSchema: ConfigVazia,
  async executar(entrada) {
    const { evento, estado, cardapio } = entrada

    const escolhidaId = escolherDaLista(evento, estado.apresentados)
    const categoria = escolhidaId ? cardapio.categorias.find((c) => c.id === escolhidaId) : undefined
    if (!categoria) {
      const menu = menuNumerado(
        'Nao reconheci a categoria. Escolha uma:',
        cardapio.categorias.map((c) => ({ id: c.id, rotulo: c.nome })),
      )
      return reapresentar({ ...estado, apresentados: menu.ids }, texto(menu.texto))
    }

    const itens = cardapio.itensPorCategoria.get(categoria.id) ?? []
    if (itens.length === 0) {
      const menu = menuNumerado(
        `Nenhum item disponivel em ${categoria.nome} agora. Escolha outra categoria:`,
        cardapio.categorias.map((c) => ({ id: c.id, rotulo: c.nome })),
      )
      return reapresentar({ ...estado, apresentados: menu.ids }, texto(menu.texto))
    }

    const menu = menuNumerado(
      `${categoria.nome} - escolha um item:`,
      itens.map((it) => ({ id: it.id, rotulo: `${it.nome} (${formatarPreco(it.preco_centavos)})` })),
    )
    const proximo = {
      ...estado,
      etapa: 'montar_pedido',
      categoria_id: categoria.id,
      item_id: null,
      grupos_pendentes: [],
      opcoes_ids: [],
      apresentados: menu.ids,
      falhas: 0,
    }
    return saida('montar_pedido', [texto(menu.texto)], [efeitoEstado(proximo)])
  },
}
