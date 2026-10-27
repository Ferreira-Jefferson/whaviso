// Node `saudacao`: primeira porta do fluxo. Da as boas-vindas com o nome da loja, checa o
// horario de funcionamento e abre o cardapio pela lista de categorias. Fora do horario, resposta
// fixa e encerra. Sem categorias, avisa e encerra. SEM LLM: so branding + gate + menu.
import { z } from 'zod'
import type { NodeContract } from '@whaviso/shared/contracts'
import { efeitoEncerrar, efeitoEstado, saida, texto } from '../acoes'
import { menuCategorias } from '../comum'
import { lojaAberta } from '../horario'
import { type EntradaTurno } from '../tipos'

/** Config publicada pelo builder (espelha o catalogo do kernel): saudacao personalizada da loja. */
export const ConfigSaudacao = z.object({ mensagem: z.string().trim().min(1).max(500).optional() }).strict()
export type ConfigSaudacao = z.infer<typeof ConfigSaudacao>

export const saudacaoNode: NodeContract<ConfigSaudacao, EntradaTurno> = {
  tipo: 'saudacao',
  usaLlm: false,
  configSchema: ConfigSaudacao,
  async executar(entrada, config) {
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

    // O grafo publicado pode personalizar a saudacao; sem config, vale o texto padrao.
    const titulo = config.mensagem ?? `Ola! Bem-vindo a ${loja.nome}. Escolha uma categoria do cardapio:`
    const menu = menuCategorias(cardapio, titulo)
    const proximo = { ...estado, etapa: 'pedir_categoria', apresentados: menu.ids, falhas: 0 }
    return saida('pedir_categoria', [texto(menu.texto)], [efeitoEstado(proximo)])
  },
}
