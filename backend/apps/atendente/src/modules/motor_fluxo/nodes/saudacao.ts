// Node `saudacao`: primeira porta do fluxo. Da as boas-vindas com o nome da loja, checa o
// horario de funcionamento e abre o cardapio pela lista de categorias. Fora do horario, resposta
// fixa e encerra. Sem categorias, avisa e encerra. SEM LLM: so branding + gate + menu.
import type { NodeContract } from '@whaviso/shared/contracts'
import { efeitoEncerrar, efeitoEstado, saida, texto } from '../acoes'
import { menuCategorias } from '../comum'
import { lojaAberta } from '../horario'
import { ConfigVazia, type EntradaTurno } from '../tipos'

export const saudacaoNode: NodeContract<ConfigVazia, EntradaTurno> = {
  tipo: 'saudacao',
  usaLlm: false,
  configSchema: ConfigVazia,
  async executar(entrada) {
    const { loja, cardapio, estado, agora } = entrada

    if (!lojaAberta(loja.horarios, agora)) {
      return saida(
        null,
        [texto(`Ola! No momento a ${loja.nome} esta fechada. Volte dentro do horario de atendimento.`)],
        [efeitoEncerrar()],
      )
    }

    if (cardapio.categorias.length === 0) {
      return saida(
        null,
        [texto(`Ola! O cardapio da ${loja.nome} esta indisponivel agora. Tente novamente em instantes.`)],
        [efeitoEncerrar()],
      )
    }

    const menu = menuCategorias(cardapio, `Ola! Bem-vindo a ${loja.nome}. Escolha uma categoria do cardapio:`)
    const proximo = { ...estado, etapa: 'pedir_categoria', apresentados: menu.ids, falhas: 0 }
    return saida('pedir_categoria', [texto(menu.texto)], [efeitoEstado(proximo)])
  },
}
