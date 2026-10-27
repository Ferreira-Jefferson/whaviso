// Node `montar_pedido`: conduz a escolha de UM item e suas secoes obrigatorias, e adiciona a
// linha ao carrinho. Duas fases serializadas pelo estado:
//   (1) item_id == null  -> aguarda a escolha do item; se o item tem grupo(s) obrigatorio(s),
//       passa a perguntar as opcoes; senao fecha a linha direto.
//   (2) item_id != null  -> aguarda a opcao do proximo grupo pendente; ao esvaziar, fecha a linha.
// Ao fechar a linha, mostra o resumo do carrinho e os botoes de confirmacao (prompt de `confirmar`).
// Referencias (item/opcao) sao sempre revalidadas contra o cardapio vivo (SEC-002). SEM LLM.
import type { NodeContract, SaidaNode } from '@whaviso/shared/contracts'
import { botoes, efeitoEstado, saida, texto } from '../acoes'
import { formatarPreco, menuNumerado, reapresentar } from '../comum'
import { escolherDaLista } from '../entrada'
import { gruposObrigatorios } from '../cardapio'
import { resumoCarrinho } from '../resumo'
import { BOTAO_CANCELAR, BOTAO_CONFIRMAR, BOTAO_MAIS } from '../ids'
import { ConfigVazia, type EntradaTurno, type EstadoFluxo, type GrupoCtx } from '../tipos'

export const montarPedidoNode: NodeContract<ConfigVazia, EntradaTurno> = {
  tipo: 'montar_pedido',
  usaLlm: false,
  configSchema: ConfigVazia,
  async executar(entrada) {
    return entrada.estado.item_id === null ? escolherItem(entrada) : escolherOpcao(entrada)
  },
}

function escolherItem(entrada: EntradaTurno): SaidaNode {
  const { evento, estado, cardapio } = entrada
  const itensCat = cardapio.itensPorCategoria.get(estado.categoria_id ?? '') ?? []
  const escolhidoId = escolherDaLista(evento, estado.apresentados)
  const item = escolhidoId ? itensCat.find((it) => it.id === escolhidoId) : undefined
  if (!item) {
    const menu = menuNumerado(
      'Nao reconheci o item. Escolha um:',
      itensCat.map((it) => ({ id: it.id, rotulo: `${it.nome} (${formatarPreco(it.preco_centavos)})` })),
    )
    return reapresentar({ ...estado, apresentados: menu.ids }, texto(menu.texto))
  }

  const grupos = cardapio.gruposPorItem.get(item.id) ?? []
  const obrigatorios = gruposObrigatorios(grupos)
  if (obrigatorios.length === 0) {
    const comLinha: EstadoFluxo = {
      ...estado,
      carrinho: [...estado.carrinho, { item_id: item.id, quantidade: 1, opcoes_ids: [] }],
      item_id: null,
      grupos_pendentes: [],
      opcoes_ids: [],
      falhas: 0,
    }
    return irParaConfirmar(comLinha, cardapio)
  }

  const primeiro = obrigatorios[0]!
  const menu = perguntaGrupo(primeiro)
  const proximo: EstadoFluxo = {
    ...estado,
    item_id: item.id,
    grupos_pendentes: obrigatorios.map((g) => g.id),
    opcoes_ids: [],
    apresentados: menu.ids,
    falhas: 0,
  }
  return saida('montar_pedido', [texto(menu.texto)], [efeitoEstado(proximo)])
}

function escolherOpcao(entrada: EntradaTurno): SaidaNode {
  const { evento, estado, cardapio } = entrada
  const grupos = cardapio.gruposPorItem.get(estado.item_id ?? '') ?? []
  const grupoId = estado.grupos_pendentes[0]
  const grupo = grupos.find((g) => g.id === grupoId)
  if (!grupo) {
    // Estado inconsistente (item saiu do cardapio): recomeca a linha deste item.
    return reapresentar(
      { ...estado, item_id: null, grupos_pendentes: [], opcoes_ids: [] },
      texto('Vamos recomecar este item. Escolha novamente.'),
    )
  }

  const escolhidaId = escolherDaLista(evento, estado.apresentados)
  const opcao = escolhidaId ? grupo.opcoes.find((o) => o.id === escolhidaId) : undefined
  if (!opcao) {
    const menu = perguntaGrupo(grupo)
    return reapresentar({ ...estado, apresentados: menu.ids }, texto(menu.texto))
  }

  const opcoes = [...estado.opcoes_ids, opcao.id]
  const pendentes = estado.grupos_pendentes.slice(1)
  if (pendentes.length === 0) {
    const comLinha: EstadoFluxo = {
      ...estado,
      carrinho: [...estado.carrinho, { item_id: estado.item_id!, quantidade: 1, opcoes_ids: opcoes }],
      item_id: null,
      grupos_pendentes: [],
      opcoes_ids: [],
      falhas: 0,
    }
    return irParaConfirmar(comLinha, cardapio)
  }

  const proxGrupo = grupos.find((g) => g.id === pendentes[0])!
  const menu = perguntaGrupo(proxGrupo)
  const proximo: EstadoFluxo = { ...estado, opcoes_ids: opcoes, grupos_pendentes: pendentes, apresentados: menu.ids, falhas: 0 }
  return saida('montar_pedido', [texto(menu.texto)], [efeitoEstado(proximo)])
}

/** Monta a pergunta de um grupo (menu numerado das opcoes com preco). */
function perguntaGrupo(grupo: GrupoCtx): { texto: string; ids: string[] } {
  return menuNumerado(
    `${grupo.nome} - escolha uma opcao:`,
    grupo.opcoes.map((o) => ({
      id: o.id,
      rotulo: o.preco_centavos > 0 ? `${o.nome} (+${formatarPreco(o.preco_centavos)})` : o.nome,
    })),
  )
}

/** Transiciona para `confirmar`: resumo do carrinho + botoes confirmar/adicionar/cancelar. */
function irParaConfirmar(estado: EstadoFluxo, cardapio: EntradaTurno['cardapio']): SaidaNode {
  const resumo = resumoCarrinho(cardapio, estado.carrinho)
  const proximo: EstadoFluxo = { ...estado, etapa: 'confirmar', apresentados: [], falhas: 0 }
  const msg = botoes(`${resumo.texto}\n\nPosso confirmar o pedido?`, [
    { id: BOTAO_CONFIRMAR, rotulo: 'Confirmar' },
    { id: BOTAO_MAIS, rotulo: 'Adicionar mais' },
    { id: BOTAO_CANCELAR, rotulo: 'Cancelar' },
  ])
  return saida('confirmar', [msg], [efeitoEstado(proximo)])
}
