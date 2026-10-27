// Node `montar_pedido`: conduz a escolha de UM item e a coleta das suas secoes, e adiciona a linha
// ao carrinho. Fases serializadas pelo estado:
//   (1) item_id == null  -> aguarda a escolha do item; monta a fila de grupos independentes.
//   (2) item_id != null  -> coleta o grupo atual respeitando min_escolhas/max_escolhas; ao escolher
//       uma opcao, injeta os grupos que dependem dela (add-on por tamanho); grupos opcionais podem
//       ser pulados ("0"). Ao esvaziar a fila, valida e fecha a linha.
// Referencias (item/opcao) sao sempre revalidadas contra o cardapio vivo (SEC-002). SEM LLM.
import type { NodeContract, SaidaNode } from '@whaviso/shared/contracts'
import { botoes, efeitoEstado, saida, texto } from '../acoes'
import { formatarPreco, menuNumerado, reapresentar } from '../comum'
import { escolherDaLista } from '../entrada'
import { ErroMontagem, gruposDependentesDe, gruposIndependentes, minimoDoGrupo, montarLinha } from '../cardapio'
import { resumoCarrinho } from '../resumo'
import { BOTAO_CANCELAR, BOTAO_CONFIRMAR, BOTAO_MAIS } from '../ids'
import { ConfigVazia, type EntradaTurno, type EstadoFluxo, type GrupoCtx } from '../tipos'

const FINALIZAR = '0'

export const montarPedidoNode: NodeContract<ConfigVazia, EntradaTurno> = {
  tipo: 'montar_pedido',
  usaLlm: true, // so declara que o TEXTO LIVRE pode ir ao harness (motor); o node segue deterministico
  configSchema: ConfigVazia,
  async executar(entrada) {
    return entrada.estado.item_id === null ? escolherItem(entrada) : coletarGrupo(entrada)
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
  const fila = gruposIndependentes(grupos)
  if (fila.length === 0) {
    return fecharLinha({ ...estado, item_id: item.id, opcoes_ids: [], opcoes_grupo: [] }, grupos, cardapio)
  }
  const menu = menuGrupo(fila[0]!, [])
  const proximo: EstadoFluxo = {
    ...estado,
    item_id: item.id,
    grupos_pendentes: fila.map((g) => g.id),
    opcoes_grupo: [],
    opcoes_ids: [],
    apresentados: menu.ids,
    falhas: 0,
  }
  return saida('montar_pedido', [texto(menu.texto)], [efeitoEstado(proximo)])
}

function coletarGrupo(entrada: EntradaTurno): SaidaNode {
  const { evento, estado, cardapio } = entrada
  const grupos = cardapio.gruposPorItem.get(estado.item_id ?? '') ?? []
  const grupo = grupos.find((g) => g.id === estado.grupos_pendentes[0])
  if (!grupo) {
    return reapresentar(
      { ...estado, item_id: null, grupos_pendentes: [], opcoes_grupo: [], opcoes_ids: [] },
      texto('Vamos recomecar este item. Escolha novamente.'),
    )
  }

  const escolhidas = estado.opcoes_grupo
  const minReq = minimoDoGrupo(grupo)

  // Reply "0" = finalizar/pular o grupo (so quando permitido e o minimo ja foi atingido).
  if (evento.texto === FINALIZAR && podeFinalizar(grupo)) {
    if (escolhidas.length >= minReq) return comitarGrupo(estado, grupos, cardapio)
    const menu = menuGrupo(grupo, escolhidas)
    return reapresentar({ ...estado, apresentados: menu.ids }, texto(`Escolha pelo menos ${minReq}.\n${menu.texto}`))
  }

  const escolhidoId = escolherDaLista(evento, estado.apresentados)
  const opcao = escolhidoId ? grupo.opcoes.find((o) => o.id === escolhidoId) : undefined
  if (!opcao) {
    const menu = menuGrupo(grupo, escolhidas)
    return reapresentar({ ...estado, apresentados: menu.ids }, texto(menu.texto))
  }

  const novasEscolhidas = [...escolhidas, opcao.id]
  const atingiuMax = grupo.max_escolhas !== null && novasEscolhidas.length >= grupo.max_escolhas
  const comEscolha: EstadoFluxo = { ...estado, opcoes_grupo: novasEscolhidas, falhas: 0 }
  if (atingiuMax) return comitarGrupo(comEscolha, grupos, cardapio)

  const menu = menuGrupo(grupo, novasEscolhidas)
  return saida('montar_pedido', [texto(menu.texto)], [efeitoEstado({ ...comEscolha, apresentados: menu.ids })])
}

/** Fecha o grupo atual: agrega as opcoes, injeta os grupos dependentes das escolhas e avanca. */
function comitarGrupo(estado: EstadoFluxo, grupos: readonly GrupoCtx[], cardapio: EntradaTurno['cardapio']): SaidaNode {
  const opcoesItem = [...estado.opcoes_ids, ...estado.opcoes_grupo]
  const resto = estado.grupos_pendentes.slice(1)
  const dependentes: string[] = []
  for (const opt of estado.opcoes_grupo) {
    for (const g of gruposDependentesDe(grupos, opt)) {
      if (!resto.includes(g.id) && !dependentes.includes(g.id)) dependentes.push(g.id)
    }
  }
  const fila = [...dependentes, ...resto].filter((id) => grupos.some((g) => g.id === id))

  const base: EstadoFluxo = { ...estado, opcoes_ids: opcoesItem, opcoes_grupo: [], grupos_pendentes: fila, falhas: 0 }
  if (fila.length === 0) return fecharLinha(base, grupos, cardapio)

  const menu = menuGrupo(grupos.find((g) => g.id === fila[0])!, [])
  return saida('montar_pedido', [texto(menu.texto)], [efeitoEstado({ ...base, apresentados: menu.ids })])
}

/** Valida a linha montada contra o cardapio e a adiciona ao carrinho; degrada se ficou invalida. */
function fecharLinha(estado: EstadoFluxo, grupos: readonly GrupoCtx[], cardapio: EntradaTurno['cardapio']): SaidaNode {
  const item = cardapio.itensPorId.get(estado.item_id ?? '')
  const linha = { item_id: estado.item_id!, quantidade: 1, opcoes_ids: estado.opcoes_ids }
  if (!item) {
    return reapresentar(limparItem(estado), texto('Esse item ficou indisponivel. Escolha outro.'))
  }
  try {
    montarLinha(item, grupos, linha)
  } catch (erro) {
    if (erro instanceof ErroMontagem) {
      return reapresentar(limparItem(estado), texto('Nao consegui montar esse item com essas opcoes. Vamos tentar de novo.'))
    }
    throw erro
  }
  const comLinha: EstadoFluxo = { ...limparItem(estado), carrinho: [...estado.carrinho, linha] }
  return irParaConfirmar(comLinha, cardapio)
}

function limparItem(estado: EstadoFluxo): EstadoFluxo {
  return { ...estado, item_id: null, grupos_pendentes: [], opcoes_grupo: [], opcoes_ids: [], falhas: 0 }
}

/** true se o grupo admite finalizar/pular com "0" (nao e o caso do obrigatorio de escolha unica). */
function podeFinalizar(grupo: GrupoCtx): boolean {
  return !(grupo.obrigatorio && minimoDoGrupo(grupo) === 1 && grupo.max_escolhas === 1)
}

/** Menu numerado do grupo: opcoes ainda nao escolhidas + "0" (finalizar/pular) quando permitido. */
function menuGrupo(grupo: GrupoCtx, escolhidas: readonly string[]): { texto: string; ids: string[] } {
  const restantes = grupo.opcoes.filter((o) => !escolhidas.includes(o.id))
  const linhas = restantes.map(
    (o, i) => `${i + 1}. ${o.preco_centavos > 0 ? `${o.nome} (+${formatarPreco(o.preco_centavos)})` : o.nome}`,
  )
  if (podeFinalizar(grupo)) {
    const pular = escolhidas.length === 0 && minimoDoGrupo(grupo) === 0
    linhas.push(`${FINALIZAR}. ${pular ? 'Pular' : 'Finalizar'}`)
  }
  const titulo =
    escolhidas.length > 0
      ? `${grupo.nome} (${escolhidas.length} escolhido). Adicione outra ou finalize:`
      : `${grupo.nome} - escolha:`
  return { texto: `${titulo}\n${linhas.join('\n')}\n\nResponda com o numero.`, ids: restantes.map((o) => o.id) }
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
