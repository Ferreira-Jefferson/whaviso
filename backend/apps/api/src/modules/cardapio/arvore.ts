// Monta a arvore resolvida (categorias -> itens -> grupos efetivos -> opcoes) a partir das linhas.
// Funcao pura sobre `DadosCardapio`: o mesmo resolvedor serve ao painel e a visao "pedivel agora".
import { dentroDaProgramacao, estaDisponivel, resolverGruposDoItem } from './resolvedor'
import { categoriaSaida, itemSaida, opcaoSaida } from './mapeadores'
import type { DadosCardapio, OpcaoRow, VinculoCategoriaRow, VinculoItemRow } from './repo'
import type { CardapioResolvidoSaida, GrupoResolvido, ItemResolvido } from './schemas'

function agrupar<T>(linhas: readonly T[], chave: (l: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const l of linhas) {
    const k = chave(l)
    const lista = m.get(k)
    if (lista) lista.push(l)
    else m.set(k, [l])
  }
  return m
}

/**
 * `modo = 'painel'`: tudo (inclusive inativos, com flags). `modo = 'pedivel'`: so o que da para
 * pedir agora (categoria ativa e na programacao, item e opcoes disponiveis, grupos obrigatorios
 * atendiveis).
 */
export function montarArvore(
  dados: DadosCardapio,
  agora: Date,
  modo: 'painel' | 'pedivel',
): CardapioResolvidoSaida {
  const gruposPorId = new Map(dados.grupos.map((g) => [g.id, g]))
  const opcoesPorGrupo = agrupar(dados.opcoes, (o) => o.grupo_id)
  const opcaoPorId = new Map(dados.opcoes.map((o) => [o.id, o]))
  const vincCat = agrupar<VinculoCategoriaRow>(dados.vinculosCategoria, (v) => v.categoria_id)
  const vincItem = agrupar<VinculoItemRow>(dados.vinculosItem, (v) => v.item_id)
  const itensPorCat = agrupar(dados.itens, (i) => i.categoria_id)

  const categorias = dados.categorias.map((c) => {
    const doCat = vincCat.get(c.id) ?? []
    const catDisponivel = c.ativo && dentroDaProgramacao(c.programacao, agora)

    const itens: ItemResolvido[] = (itensPorCat.get(c.id) ?? []).map((i) => {
      const doItem = vincItem.get(i.id) ?? []
      const efetivos = resolverGruposDoItem(doCat, doItem, gruposPorId)
        // Add-on preso a uma opcao de tamanho que foi desativada nao e alcancavel: some.
        .filter((e) => {
          const alvo = e.grupo.aplica_a_opcao_id
          return alvo === null || opcaoPorId.get(alvo)?.ativo === true
        })

      const grupos: GrupoResolvido[] = efetivos.map((e) => {
        const todas: OpcaoRow[] = opcoesPorGrupo.get(e.grupo.id) ?? []
        const visiveis = modo === 'pedivel' ? todas.filter((o) => estaDisponivel(o, agora)) : todas
        return {
          id: e.grupo.id,
          nome: e.grupo.nome,
          tipo: e.grupo.tipo,
          obrigatorio: e.grupo.obrigatorio,
          min_escolhas: e.grupo.min_escolhas,
          max_escolhas: e.grupo.max_escolhas,
          aplica_a_opcao_id: e.grupo.aplica_a_opcao_id,
          ordem: e.ordemEfetiva,
          origem: e.origem,
          opcoes: visiveis.map((o) => opcaoSaida(o, agora)),
        }
      })

      const atendivel = grupos.every((g) => {
        if (!g.obrigatorio || g.aplica_a_opcao_id !== null) return true
        const livres = g.opcoes.filter((o) => o.disponivel).length
        return livres >= Math.max(g.min_escolhas, 1)
      })
      const base = itemSaida(i, doCat, doItem, agora)
      return { ...base, pedivel: catDisponivel && base.disponivel && atendivel, grupos }
    })

    return {
      ...categoriaSaida(c, doCat),
      disponivel_agora: catDisponivel,
      itens: modo === 'pedivel' ? itens.filter((i) => i.pedivel) : itens,
    }
  })

  return {
    gerado_em: agora.toISOString(),
    categorias: modo === 'pedivel' ? categorias.filter((c) => c.itens.length > 0) : categorias,
  }
}
