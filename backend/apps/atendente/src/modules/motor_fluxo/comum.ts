// Helpers PUROS comuns aos nodes: menu numerado, reapresentacao e handoff por falhas.
// Nenhum node importa outro node; a logica compartilhada e dado/funcao pura, mora aqui.
import type { MensagemProposta, SaidaNode } from '@whaviso/shared/contracts'
import { botoes, efeitoEstado, efeitoHandoff, saida, texto } from './acoes'
import { BOTAO_PAG_CARTAO, BOTAO_PAG_DINHEIRO, BOTAO_PAG_PIX } from './ids'
import type { CardapioCtx, EstadoFluxo } from './tipos'

/** Apos este numero de entradas fora do esperado, oferece falar com um humano (handoff). */
export const MAX_FALHAS = 3

/** Formata centavos em reais para rotulo/resumo (ex.: 2000 -> R$ 20,00). Puro. */
export function formatarPreco(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`
}

export interface ItemMenu {
  id: string
  rotulo: string
}

/** Monta um menu numerado em texto e devolve a mensagem e os ids na ordem apresentada. */
export function menuNumerado(titulo: string, itens: readonly ItemMenu[]): { texto: string; ids: string[] } {
  const linhas = itens.map((it, i) => `${i + 1}. ${it.rotulo}`)
  const corpo = `${titulo}\n${linhas.join('\n')}\n\nResponda com o numero da opcao.`
  return { texto: corpo, ids: itens.map((it) => it.id) }
}

/** Menu numerado das categorias ativas da loja (reusado na saudacao e no "adicionar mais"). */
export function menuCategorias(cardapio: CardapioCtx, titulo: string): { texto: string; ids: string[] } {
  return menuNumerado(
    titulo,
    cardapio.categorias.map((c) => ({ id: c.id, rotulo: c.nome })),
  )
}

/** Menu numerado dos bairros atendidos (zonas ativas). O "id" apresentado e o proprio bairro. */
export function menuBairros(zonasBairros: readonly string[]): { texto: string; ids: string[] } {
  return menuNumerado(
    'Para qual bairro e a entrega?',
    zonasBairros.map((b) => ({ id: b, rotulo: b })),
  )
}

/**
 * Inicia o cadastro de um endereco novo. Com zonas configuradas, pergunta o BAIRRO por lista (isso
 * resolve a zona/taxa e restringe a area); sem zonas, pede o endereco por texto (sem restricao de
 * area, taxa 0). O node de endereco segue a partir de `aguardando`.
 */
export function iniciarEnderecoNovo(estado: EstadoFluxo, zonasBairros: readonly string[]): SaidaNode {
  if (zonasBairros.length > 0) {
    const menu = menuBairros(zonasBairros)
    const proximo: EstadoFluxo = {
      ...estado, etapa: 'endereco', aguardando: 'endereco_bairro', bairro_rascunho: null, apresentados: menu.ids, falhas: 0,
    }
    return saida('endereco', [texto(menu.texto)], [efeitoEstado(proximo)])
  }
  const proximo: EstadoFluxo = {
    ...estado, etapa: 'endereco', aguardando: 'endereco_rua', bairro_rascunho: null, apresentados: [], falhas: 0,
  }
  return saida('endereco', [texto('Informe o endereco de entrega (rua e numero):')], [efeitoEstado(proximo)])
}

/** Pergunta da forma de pagamento (botoes). Reusada ao chegar na etapa `pagamento`. */
export function promptPagamento(): MensagemProposta {
  return botoes('Como voce prefere pagar?', [
    { id: BOTAO_PAG_PIX, rotulo: 'Pix' },
    { id: BOTAO_PAG_DINHEIRO, rotulo: 'Dinheiro' },
    { id: BOTAO_PAG_CARTAO, rotulo: 'Cartao na entrega' },
  ])
}

/** Aviso de loja com pedidos pausados agora (G7). Linguagem neutra; nao aceita pedido novo. */
export function mensagemPausada(nomeLoja: string): MensagemProposta {
  return texto(`Ola! No momento a ${nomeLoja} esta com os pedidos pausados. Volte daqui a pouco, por favor.`)
}

/** Limpa o scratch da etapa (selecao de item/opcoes e menu), preservando carrinho e rascunho. */
export function limparScratch(estado: EstadoFluxo): EstadoFluxo {
  return { ...estado, item_id: null, grupos_pendentes: [], opcoes_ids: [], apresentados: [], falhas: 0 }
}

/**
 * Entrada fora do esperado: reapresenta a pergunta (mantendo a etapa e os apresentados) e conta a
 * falha; ao atingir MAX_FALHAS, transfere para um humano (handoff) em vez de insistir. A mensagem
 * ja vem montada (texto ou interativo) para a pergunta reaparecer no mesmo formato.
 */
export function reapresentar(estado: EstadoFluxo, mensagem: MensagemProposta): SaidaNode {
  const falhas = estado.falhas + 1
  if (falhas >= MAX_FALHAS) {
    return saida(
      null,
      [texto('Nao consegui entender. Vou te transferir para uma pessoa da loja, so um momento.')],
      [efeitoHandoff()],
    )
  }
  const proximo = { ...estado, falhas }
  return saida(estado.etapa, [mensagem], [efeitoEstado(proximo)])
}
