// Montador de pedido (PURO): valida item/opcoes contra o cardapio lido e devolve linhas com
// SNAPSHOT (nome, grupo, preco) e totais em centavos inteiros. O preco nunca vem do cliente.
import { regraNegocio } from '../../shared/http_errors'
import {
  dentroDaProgramacao, estaDisponivel, gruposEfetivos,
  type CategoriaRow, type GrupoRow, type ItemRow, type OpcaoRow, type VinculoItemRow, type VinculoRow,
} from './cardapio_leitura'

export interface CardapioLido {
  itens: Map<string, ItemRow>
  categorias: Map<string, CategoriaRow>
  grupos: Map<string, GrupoRow>
  opcoes: Map<string, OpcaoRow>
  vinculosCategoria: Map<string, VinculoRow[]>
  vinculosItem: Map<string, VinculoItemRow[]>
}

export interface LinhaEntrada {
  item_id: string
  quantidade: number
  opcoes_ids: string[]
  observacao?: string | null | undefined
}

export interface OpcaoMontada {
  opcao_id: string
  grupo_nome_snapshot: string
  nome_snapshot: string
  preco_centavos: number
}
export interface LinhaMontada {
  item_id: string
  nome_snapshot: string
  preco_unitario_centavos: number
  quantidade: number
  total_centavos: number
  observacao: string | null
  opcoes: OpcaoMontada[]
}

const invalida = (code: string, msg: string) => regraNegocio(code, msg)

export function montarLinha(c: CardapioLido, entrada: LinhaEntrada, agora: Date): LinhaMontada {
  const item = c.itens.get(entrada.item_id)
  if (!item) throw invalida('item_invalido', 'Item inexistente neste cardapio')
  const cat = c.categorias.get(item.categoria_id)
  if (!cat?.ativo || !dentroDaProgramacao(cat.programacao, agora)) {
    throw invalida('item_indisponivel', 'Item fora da programacao')
  }
  if (!estaDisponivel(item, agora)) throw invalida('item_indisponivel', 'Item indisponivel')

  const unicas = new Set(entrada.opcoes_ids)
  if (unicas.size !== entrada.opcoes_ids.length) throw invalida('opcao_duplicada', 'Opcao repetida')

  const efetivos = gruposEfetivos(
    c.vinculosCategoria.get(item.categoria_id) ?? [], c.vinculosItem.get(item.id) ?? [], c.grupos,
  )
  const idsEfetivos = new Set(efetivos.map((g) => g.id))
  const escolhidas: OpcaoRow[] = []
  for (const id of unicas) {
    const o = c.opcoes.get(id)
    if (!o || !idsEfetivos.has(o.grupo_id)) throw invalida('opcao_invalida', 'Opcao nao pertence ao item')
    if (!estaDisponivel(o, agora)) throw invalida('opcao_indisponivel', 'Opcao indisponivel')
    escolhidas.push(o)
  }

  for (const g of efetivos) {
    const doGrupo = escolhidas.filter((o) => o.grupo_id === g.id)
    // Add-on preso a uma opcao (ex.: tamanho): so se aplica se aquela opcao foi escolhida.
    if (g.aplica_a_opcao_id !== null && !unicas.has(g.aplica_a_opcao_id)) {
      if (doGrupo.length > 0) throw invalida('opcao_invalida', 'Adicional nao se aplica a escolha feita')
      continue
    }
    const minimo = g.obrigatorio ? Math.max(g.min_escolhas, 1) : g.min_escolhas
    if (doGrupo.length < minimo) throw invalida('grupo_obrigatorio', 'Escolha obrigatoria nao feita')
    if (g.max_escolhas !== null && doGrupo.length > g.max_escolhas) {
      throw invalida('grupo_excede_maximo', 'Escolhas acima do maximo do grupo')
    }
  }

  const opcoes: OpcaoMontada[] = escolhidas.map((o) => ({
    opcao_id: o.id,
    grupo_nome_snapshot: c.grupos.get(o.grupo_id)?.nome ?? '',
    nome_snapshot: o.nome,
    preco_centavos: o.preco_centavos,
  }))
  const unitario = item.preco_centavos + opcoes.reduce((s, o) => s + o.preco_centavos, 0)
  return {
    item_id: item.id,
    nome_snapshot: item.nome,
    preco_unitario_centavos: item.preco_centavos,
    quantidade: entrada.quantidade,
    total_centavos: unitario * entrada.quantidade,
    observacao: entrada.observacao ?? null,
    opcoes,
  }
}

export function montarPedido(c: CardapioLido, linhas: readonly LinhaEntrada[], taxa: number, agora: Date) {
  const montadas = linhas.map((l) => montarLinha(c, l, agora))
  const subtotal = montadas.reduce((s, l) => s + l.total_centavos, 0)
  return { linhas: montadas, subtotal_centavos: subtotal, taxa_entrega_centavos: taxa, total_centavos: subtotal + taxa }
}
