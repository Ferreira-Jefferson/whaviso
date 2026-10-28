// Node `saudacao`: primeira porta do fluxo. Da as boas-vindas com o nome da loja e abre o cardapio
// pela lista de categorias. O gate e o MODO do atendente, derivado da disponibilidade da loja
// (fonte unica, regras-negocio/05): `fechado` responde loja fechada e encerra; `agendamento` sauda
// deixando claro que o pedido sera AGENDADO (entrega sai no horario de atendimento, nunca na hora) e
// abre o cardapio; `atendimento` segue o fluxo normal de pedido ao vivo. Sem categorias, avisa e
// encerra. SEM LLM: so branding + gate por modo + menu.
import { z } from 'zod'
import type { NodeContract } from '@whaviso/shared/contracts'
import { efeitoEncerrar, efeitoEstado, saida, texto } from '../acoes'
import { menuCategorias } from '../comum'
import { type EntradaTurno } from '../tipos'

/** Config publicada pelo builder (espelha o catalogo do kernel): saudacao personalizada da loja. */
export const ConfigSaudacao = z.object({ mensagem: z.string().trim().min(1).max(500).optional() }).strict()
export type ConfigSaudacao = z.infer<typeof ConfigSaudacao>

/** Aviso que antecede a saudacao quando o pedido e agendado (fora do horario de atendimento). */
const AVISO_AGENDAMENTO =
  'Estamos fora do horario de atendimento, entao seu pedido sera agendado: a entrega sai dentro do ' +
  'horario de atendimento, nao na hora.'

export const saudacaoNode: NodeContract<ConfigSaudacao, EntradaTurno> = {
  tipo: 'saudacao',
  usaLlm: false,
  configSchema: ConfigSaudacao,
  async executar(entrada, config) {
    const { loja, cardapio, estado } = entrada

    if (loja.modo === 'fechado') {
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

    // O grafo publicado pode personalizar a saudacao; sem config, vale o texto padrao. No modo
    // agendamento, o aviso de pedido agendado antecede a saudacao (nunca promete entrega imediata).
    const titulo = config.mensagem ?? `Ola! Bem-vindo a ${loja.nome}. Escolha uma categoria do cardapio:`
    const cabecalho = loja.modo === 'agendamento' ? `${AVISO_AGENDAMENTO} ${titulo}` : titulo
    const menu = menuCategorias(cardapio, cabecalho)
    const proximo = { ...estado, etapa: 'pedir_categoria', apresentados: menu.ids, falhas: 0 }
    return saida('pedir_categoria', [texto(menu.texto)], [efeitoEstado(proximo)])
  },
}
